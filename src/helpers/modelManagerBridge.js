const path = require("path");
const fs = require("fs");
const { promises: fsPromises } = require("fs");
const { app } = require("electron");
const {
  downloadFile: sharedDownloadFile,
  createDownloadSignal,
  cleanupStaleDownloads,
  checkDiskSpace,
} = require("./downloadUtils");

const modelRegistryData = require("../models/modelRegistryData.json");
const LlamaServerManager = require("./llamaServer");
const debugLogger = require("./debugLogger");
const { limitFailure } = require("./localAnswerLimit");
const {
  DEFAULT_ROLE,
  WRITING_ROLE,
  WRITING_PID_NAME,
  dedicatedWritingServerSupported,
  serverRoleFor,
} = require("./writingServer");

const MIN_FILE_SIZE = 1_000_000; // 1MB minimum for valid model files

// Bounds the KV cache — registry contextLength is the full trained context
// (128K+), which can exceed total RAM (#1203). Uniform for all start paths:
// start() won't restart a ready server when only options change.
const SERVER_CONTEXT_SIZE = 16384;

function getLocalProviders() {
  return modelRegistryData.localProviders || [];
}

class ModelError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ModelError";
    this.code = code;
    this.details = details;
  }
}

class ModelNotFoundError extends ModelError {
  constructor(modelId) {
    super(`Model ${modelId} not found`, "MODEL_NOT_FOUND", { modelId });
  }
}

class ModelManager {
  constructor() {
    this.modelsDir = null;
    this.downloadProgress = new Map();
    this.activeDownloads = new Map();
    this.activeRequests = new Map(); // Track HTTP requests for cancellation
    this.serverManager = new LlamaServerManager();
    this.currentServerModelId = null;
    // The writing model's own server while a recording runs (writingServer.js).
    // Created on the first hold, so nothing changes for anyone who never asks.
    this.writingServer = null;
    this.writingServerModelId = null;
    /** @type {"off" | "hold" | "idle"} */
    this.writingMode = "off";
    this.writingStartFailed = false;
    this._initialized = false;

    // IMPORTANT: Do NOT call app.getPath() here!
    // It can hang or fail before app.whenReady() in Electron 36+.
    // Initialization will happen on first use via ensureInitialized().
  }

  /**
   * Ensures the manager is initialized. Safe to call multiple times.
   * This must be called before any operation that requires modelsDir.
   */
  ensureInitialized() {
    if (this._initialized) return;

    // Check if app is ready before accessing app.getPath()
    if (!app.isReady()) {
      throw new Error(
        "ModelManager cannot be initialized before app.whenReady(). " +
          "This is a programming error - ensure ModelManager methods are only called after app is ready."
      );
    }

    this.modelsDir = this.getModelsDir();
    this._initialized = true;
    // Don't await - let this run in background
    this.ensureModelsDirExists();
    cleanupStaleDownloads(this.modelsDir);
  }

  getModelsDir() {
    const os = require("os");
    // Use os.homedir() as fallback if app.getPath fails
    const homeDir = app.isReady() ? app.getPath("home") : os.homedir();
    return path.join(homeDir, ".cache", "oats", "models");
  }

  async ensureModelsDirExists() {
    try {
      if (!this.modelsDir) {
        this.ensureInitialized();
      }
      await fsPromises.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create models directory:", error);
    }
  }

  async ensureLlamaCpp() {
    if (!this.serverManager.isAvailable()) {
      throw new ModelError(
        "llama-server binary not found. Please ensure the app is installed correctly.",
        "LLAMASERVER_NOT_FOUND"
      );
    }
    return true;
  }

  async getAllModels() {
    this.ensureInitialized();
    try {
      const models = [];

      for (const provider of getLocalProviders()) {
        for (const model of provider.models) {
          const modelPath = path.join(this.modelsDir, model.fileName);
          const isDownloaded = await this.checkModelValid(modelPath);

          models.push({
            ...model,
            providerId: provider.id,
            providerName: provider.name,
            isDownloaded,
            path: isDownloaded ? modelPath : null,
          });
        }
      }

      return models;
    } catch (error) {
      console.error("[ModelManager] Error getting all models:", error);
      throw error;
    }
  }

  async getModelsWithStatus() {
    return this.getAllModels();
  }

  async isModelDownloaded(modelId) {
    this.ensureInitialized();
    const modelInfo = this.findModelById(modelId);
    if (!modelInfo) return false;

    const modelPath = path.join(this.modelsDir, modelInfo.model.fileName);
    return this.checkModelValid(modelPath);
  }

  async checkFileExists(filePath) {
    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async checkModelValid(filePath) {
    try {
      const stats = await fsPromises.stat(filePath);
      return stats.size > MIN_FILE_SIZE;
    } catch {
      return false;
    }
  }

  findModelById(modelId) {
    for (const provider of getLocalProviders()) {
      const model = provider.models.find((m) => m.id === modelId);
      if (model) {
        return { model, provider };
      }
    }
    return null;
  }

  serverOptions(modelInfo) {
    return {
      contextSize: Math.min(
        SERVER_CONTEXT_SIZE,
        modelInfo.model.contextLength || SERVER_CONTEXT_SIZE
      ),
      threads: 4,
      gpuLayers: 99,
    };
  }

  async downloadModel(modelId, onProgress) {
    this.ensureInitialized();
    const modelInfo = this.findModelById(modelId);
    if (!modelInfo) {
      throw new ModelNotFoundError(modelId);
    }

    const { model, provider } = modelInfo;
    const modelPath = path.join(this.modelsDir, model.fileName);

    if (await this.checkModelValid(modelPath)) {
      return modelPath;
    }

    if (this.activeDownloads.get(modelId)) {
      throw new ModelError("Model is already being downloaded", "DOWNLOAD_IN_PROGRESS", {
        modelId,
      });
    }

    this.activeDownloads.set(modelId, true);
    const { signal, abort } = createDownloadSignal();
    this.activeRequests.set(modelId, { abort });

    try {
      await this.ensureModelsDirExists();

      const requiredBytes = model.sizeBytes || model.sizeMb * 1_000_000 || 0;
      if (requiredBytes > 0) {
        const spaceCheck = await checkDiskSpace(this.modelsDir, requiredBytes * 1.2);
        if (!spaceCheck.ok) {
          throw new ModelError(
            `Not enough disk space. Need ~${Math.round((requiredBytes * 1.2) / 1_000_000)}MB, ` +
              `only ${Math.round(spaceCheck.availableBytes / 1_000_000)}MB available.`,
            "INSUFFICIENT_DISK_SPACE",
            { required: requiredBytes, available: spaceCheck.availableBytes }
          );
        }
      }

      const downloadUrl = this.getDownloadUrl(provider, model);

      await sharedDownloadFile(downloadUrl, modelPath, {
        signal,
        onProgress: (downloadedBytes, totalBytes) => {
          const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
          this.downloadProgress.set(modelId, {
            modelId,
            progress,
            downloadedSize: downloadedBytes,
            totalSize: totalBytes,
          });
          if (onProgress) {
            onProgress(progress, downloadedBytes, totalBytes);
          }
        },
      });

      const stats = await fsPromises.stat(modelPath);
      if (stats.size < MIN_FILE_SIZE) {
        await fsPromises.unlink(modelPath).catch(() => {});
        throw new ModelError(
          "Downloaded file appears to be corrupted or incomplete",
          "DOWNLOAD_CORRUPTED",
          { size: stats.size, minSize: MIN_FILE_SIZE }
        );
      }

      return modelPath;
    } catch (error) {
      if (error.isAbort) {
        throw new ModelError("Download cancelled by user", "DOWNLOAD_CANCELLED", { modelId });
      }
      if (error.isHttpError) {
        throw new ModelError(`Download failed with status ${error.statusCode}`, "DOWNLOAD_FAILED", {
          statusCode: error.statusCode,
        });
      }
      if (!(error instanceof ModelError)) {
        throw new ModelError(`Network error: ${error.message}`, "NETWORK_ERROR", {
          error: error.message,
        });
      }
      throw error;
    } finally {
      this.activeDownloads.delete(modelId);
      this.activeRequests.delete(modelId);
      this.downloadProgress.delete(modelId);
    }
  }

  getDownloadUrl(provider, model) {
    const baseUrl = provider.baseUrl || "https://huggingface.co";
    return `${baseUrl}/${model.hfRepo}/resolve/main/${model.fileName}`;
  }

  cancelDownload(modelId) {
    const entry = this.activeRequests.get(modelId);
    if (entry) {
      this.activeDownloads.delete(modelId);
      this.activeRequests.delete(modelId);
      this.downloadProgress.delete(modelId);
      entry.abort();
      return true;
    }
    return false;
  }

  async deleteModel(modelId) {
    this.ensureInitialized();
    const modelInfo = this.findModelById(modelId);
    if (!modelInfo) {
      throw new ModelNotFoundError(modelId);
    }

    const modelPath = path.join(this.modelsDir, modelInfo.model.fileName);

    if (await this.checkFileExists(modelPath)) {
      await fsPromises.unlink(modelPath);
    }
  }

  async deleteAllModels() {
    this.ensureInitialized();
    try {
      if (fsPromises.rm) {
        await fsPromises.rm(this.modelsDir, { recursive: true, force: true });
      } else {
        const entries = await fsPromises
          .readdir(this.modelsDir, { withFileTypes: true })
          .catch(() => []);
        for (const entry of entries) {
          const fullPath = path.join(this.modelsDir, entry.name);
          if (entry.isDirectory()) {
            await fsPromises.rmdir(fullPath, { recursive: true }).catch(() => {});
          } else {
            await fsPromises.unlink(fullPath).catch(() => {});
          }
        }
      }
    } catch (error) {
      throw new ModelError(
        `Failed to delete models directory: ${error.message}`,
        "DELETE_ALL_ERROR",
        { error: error.message }
      );
    } finally {
      await this.ensureModelsDirExists();
    }
  }

  async runInference(modelId, prompt, options = {}) {
    this.ensureInitialized();
    const startTime = Date.now();
    debugLogger.logReasoning("INFERENCE_START", {
      modelId,
      promptLength: prompt.length,
      options: { ...options, systemPrompt: options.systemPrompt ? "[set]" : "[not set]" },
    });

    // Ensure server is available
    if (!this.serverManager.isAvailable()) {
      debugLogger.logReasoning("INFERENCE_SERVER_NOT_AVAILABLE", {});
      throw new ModelError(
        "llama-server binary not found. Please ensure the app is installed correctly.",
        "LLAMASERVER_NOT_FOUND"
      );
    }

    const modelInfo = this.findModelById(modelId);
    if (!modelInfo) {
      debugLogger.logReasoning("INFERENCE_MODEL_NOT_FOUND", { modelId });
      throw new ModelNotFoundError(modelId);
    }

    const modelPath = path.join(this.modelsDir, modelInfo.model.fileName);
    debugLogger.logReasoning("INFERENCE_MODEL_PATH", {
      modelPath,
      modelName: modelInfo.model.name,
      providerId: modelInfo.provider.id,
    });

    if (!(await this.checkModelValid(modelPath))) {
      debugLogger.logReasoning("INFERENCE_MODEL_INVALID", { modelId, modelPath });
      throw new ModelError(
        `Model ${modelId} is not downloaded or is corrupted`,
        "MODEL_NOT_DOWNLOADED",
        { modelId }
      );
    }

    const writing =
      options.serverRole === WRITING_ROLE && this.writingMode !== "off" && this.writingServer;
    const server = writing ? this.writingServer : this.serverManager;
    const loadedModelId = writing ? this.writingServerModelId : this.currentServerModelId;

    // Start/restart server if needed or if model changed
    if (!server.ready || loadedModelId !== modelId) {
      if (writing && this.writingStartFailed) {
        // Once a recording's writing server failed to start, its names wait
        // for Finish rather than trying again at every topic.
        throw new ModelError("The writing server could not start", "WRITING_SERVER_FAILED", {
          modelId,
        });
      }
      debugLogger.logReasoning("INFERENCE_STARTING_SERVER", {
        currentModel: loadedModelId,
        requestedModel: modelId,
        serverReady: server.ready,
        ...(writing ? { role: WRITING_ROLE } : {}),
      });

      try {
        await server.start(modelPath, this.serverOptions(modelInfo));
      } catch (error) {
        if (writing && this.writingMode === "hold") this.writingStartFailed = true;
        throw error;
      }
      if (writing) this.writingServerModelId = modelId;
      else this.currentServerModelId = modelId;

      debugLogger.logReasoning("INFERENCE_SERVER_STARTED", {
        port: server.port,
        model: modelId,
        ...(writing ? { role: WRITING_ROLE } : {}),
      });
    }

    // Build messages for chat completion
    const messages = [
      { role: "system", content: options.systemPrompt || "" },
      { role: "user", content: prompt },
    ];

    debugLogger.logReasoning("INFERENCE_SENDING_REQUEST", {
      messageCount: messages.length,
      systemPromptLength: (options.systemPrompt || "").length,
      userPromptLength: prompt.length,
    });

    try {
      const result = await server.inference(messages, {
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 512,
        disableThinking: options.disableThinking,
        requireComplete: options.requireComplete,
      });

      const totalTime = Date.now() - startTime;
      debugLogger.logReasoning("INFERENCE_SUCCESS", {
        totalTimeMs: totalTime,
        resultLength: result.length,
        resultPreview: result.substring(0, 200) + (result.length > 200 ? "..." : ""),
      });

      return result;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      debugLogger.logReasoning("INFERENCE_FAILED", {
        totalTimeMs: totalTime,
        error: error.message,
      });
      // A cut answer keeps its reason (localAnswerLimit.js), so the record can
      // tell a conversation too long for this Mac from an answer that ran long.
      const limit = limitFailure(error);
      throw new ModelError(
        `Inference failed: ${error.message}`,
        limit?.code ?? "INFERENCE_FAILED",
        { error: error.message, ...limit?.details }
      );
    }
  }

  async stopServer(role = DEFAULT_ROLE) {
    if (role === WRITING_ROLE) {
      if (this.writingServer) await this.writingServer.stop();
      this.writingServerModelId = null;
      return;
    }
    await this.serverManager.stop();
    this.currentServerModelId = null;
  }

  /** Whether this computer can run the writing model in a server of its own. */
  dedicatedWritingServerSupported() {
    const os = require("os");
    return dedicatedWritingServerSupported({
      platform: process.platform,
      arch: process.arch,
      memoryBytes: os.totalmem(),
      binaryAvailable: this.serverManager.isAvailable(),
    });
  }

  /** The server a request that asks for `requested` goes to now. */
  serverRole(requested) {
    return serverRoleFor({
      requested,
      mode: this.writingMode,
      writingRunning: Boolean(this.writingServer?.ready && this.writingServer.process),
    });
  }

  /**
   * The renderer's word on the writing server (writingServer.js WRITING_MODES).
   * Resolves with whether the writing model has a server of its own now.
   *
   * @param {"hold" | "idle" | "stop"} mode
   * @returns {Promise<{ dedicated: boolean }>}
   */
  async setWritingServer(mode) {
    if (mode === "hold") {
      if (!this.dedicatedWritingServerSupported()) {
        await this.setWritingServer("stop");
        return { dedicated: false };
      }
      if (this.writingMode !== "hold") this.writingStartFailed = false;
      this.writingMode = "hold";
      this.writingServer ??= new LlamaServerManager({ pidName: WRITING_PID_NAME });
      this.writingServer.setKeepAlive(true);
      debugLogger.info("Writing server held for the recording");
      return { dedicated: true };
    }
    if (mode === "idle") {
      if (this.writingMode === "off") return { dedicated: false };
      this.writingMode = "idle";
      this.writingServer?.setKeepAlive(false);
      return { dedicated: true };
    }
    const wasOn = this.writingMode !== "off";
    this.writingMode = "off";
    this.writingStartFailed = false;
    this.writingServer?.setKeepAlive(false);
    await this.stopServer(WRITING_ROLE);
    if (wasOn) debugLogger.info("Writing server stopped");
    return { dedicated: false };
  }

  getServerStatus() {
    return this.serverManager.getStatus();
  }

  async prewarmServer(modelId) {
    if (!modelId) return false;
    this.ensureInitialized();

    const modelInfo = this.findModelById(modelId);
    if (!modelInfo) return false;

    const modelPath = path.join(this.modelsDir, modelInfo.model.fileName);
    if (!(await this.checkModelValid(modelPath))) return false;

    if (!this.serverManager.isAvailable()) return false;

    try {
      await this.serverManager.start(modelPath, this.serverOptions(modelInfo));
      this.currentServerModelId = modelId;
      debugLogger.info("llama-server pre-warmed", { modelId });
      return true;
    } catch (error) {
      debugLogger.warn("Failed to pre-warm llama-server", { error: error.message });
      return false;
    }
  }
}

module.exports = {
  default: new ModelManager(),
  ModelError,
  ModelNotFoundError,
};
