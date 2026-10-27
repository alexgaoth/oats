import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Check } from "lucide-react";
import registry from "../../config/languageRegistry.json";
import { LIST_SEARCH_THRESHOLD } from "../../config/constants";
import { cn } from "../lib/utils";

export interface LanguageOption {
  value: string;
  label: string;
  flag: string;
}

const REGISTRY_OPTIONS: LanguageOption[] = registry.languages.map(({ code, label, flag }) => ({
  value: code,
  label,
  flag,
}));

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: LanguageOption[];
  className?: string;
  placeholder?: string;
  /**
   * "control" is the shadcn/ui control, for a row that holds other controls
   * (the setup screen): the box of an outline `Button size="sm"`, a menu like
   * `ui/select.tsx`, and the names without flags. The default, "compact", is
   * the smaller picker Settings uses.
   */
  variant?: "compact" | "control";
  /** The edge of the trigger that the menu lines up with. */
  align?: "start" | "end";
  /** The element that names the picker. The trigger reads it, then the value. */
  "aria-labelledby"?: string;
}

/** Scroll `list` so that `item` is in view, and move nothing else on the page. */
function keepInView(list: HTMLElement | null, item: HTMLElement | null, center: boolean) {
  if (!list || !item) return;
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (center) {
    list.scrollTop = Math.max(0, top - (list.clientHeight - item.offsetHeight) / 2);
  } else if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

export default function LanguageSelector({
  value,
  onChange,
  options,
  className = "",
  placeholder,
  variant = "compact",
  align = "start",
  "aria-labelledby": labelledBy,
}: LanguageSelectorProps) {
  const { t } = useTranslation();
  const control = variant === "control";
  const triggerId = useId();
  const items = options ?? REGISTRY_OPTIONS;
  const showSearch = items.length > LIST_SEARCH_THRESHOLD;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // True from opening until the first frame has centred the chosen language.
  const centerOnOpenRef = useRef(false);
  // Where the pointer was. The list scrolling under a still pointer is not the
  // pointer moving, and must not take the highlight from the keyboard.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const filteredLanguages = showSearch
    ? items.filter(
        (lang) =>
          lang.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  }, []);

  // Determine the portal container: use the closest dialog if inside one (to stay
  // within Radix's focus trap), otherwise fall back to document.body.
  const setContainerNode = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) return;
    const dialog = node.closest('[role="dialog"]');
    setPortalTarget((dialog as HTMLElement) ?? document.body);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current && portalTarget) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const target = portalTarget;
      // When portaled into a transformed ancestor (e.g. Radix Dialog),
      // fixed positioning is relative to that ancestor, not the viewport.
      const offsetX = target === document.body ? 0 : target.getBoundingClientRect().left;
      const offsetY = target === document.body ? 0 : target.getBoundingClientRect().top;
      const menuWidth = Math.max(triggerRect.width, 240);
      const containerRight =
        (target === document.body ? window.innerWidth : target.getBoundingClientRect().right) -
        offsetX;
      let left =
        align === "end" ? triggerRect.right - offsetX - menuWidth : triggerRect.left - offsetX;
      if (left + menuWidth > containerRight - 8) {
        left = triggerRect.right - offsetX - menuWidth;
      }
      setDropdownPosition({
        top: triggerRect.bottom + 4 - offsetY,
        left: Math.max(8, left),
        width: menuWidth,
      });
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen, portalTarget, align]);

  // The menu opens on the chosen language rather than at the top of the list,
  // and the keyboard's place in the list stays in view as it moves.
  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    const item = list?.querySelectorAll<HTMLElement>('[role="option"]')[highlightedIndex] ?? null;
    keepInView(list, item, centerOnOpenRef.current);
    centerOnOpenRef.current = false;
  }, [isOpen, highlightedIndex]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const open = () => {
    const chosen = items.findIndex((l) => l.value === value);
    centerOnOpenRef.current = true;
    lastPointerRef.current = null;
    setHighlightedIndex(Math.max(0, chosen));
    setIsOpen(true);
  };

  // From the keyboard, focus goes back to the trigger, where it was; a click
  // leaves it where the click put it.
  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    handleSearchQueryChange("");
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleSelect = (languageValue: string, restoreFocus: boolean) => {
    onChange(languageValue);
    close(restoreFocus);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredLanguages.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredLanguages.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredLanguages[highlightedIndex]) {
          handleSelect(filteredLanguages[highlightedIndex].value, true);
        }
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
    }
  };

  const clearSearch = () => {
    handleSearchQueryChange("");
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const selected = items.find((l) => l.value === value);

  return (
    <div className={`relative ${className}`} ref={setContainerNode}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={handleKeyDown}
        className={
          control
            ? cn(
                // ui/select.tsx's trigger, at the height of an outline Button size="sm".
                "flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-[13px] text-foreground shadow-xs",
                "outline-none transition-[color,background-color,border-color,box-shadow] duration-150",
                "hover:bg-accent dark:bg-input/20 dark:hover:bg-input/40",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                isOpen && "bg-accent dark:bg-input/40"
              )
            : `
          group relative w-full flex items-center justify-between gap-2
          h-7 px-2.5 text-left
          rounded text-xs font-medium
          border shadow-sm backdrop-blur-sm
          transition-[background-color,border-color,transform] duration-200 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1
          ${
            isOpen
              ? "border-border-active bg-surface-2/90 shadow ring-1 ring-primary/20"
              : "border-border/70 bg-surface-1/80 hover:border-border-hover hover:bg-surface-2/70 hover:shadow active:scale-[0.985]"
          }
        `
        }
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelledBy ? `${labelledBy} ${triggerId}` : undefined}
      >
        <span className={`truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {!control && (
            <span aria-hidden="true" className="mr-1.5">
              {selected?.flag ?? "\uD83C\uDF10"}
            </span>
          )}
          {selected?.label ?? (value || placeholder || "")}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={
            control
              ? "size-4 shrink-0 text-muted-foreground"
              : `w-3.5 h-3.5 shrink-0 text-muted-foreground transition-[color,transform] duration-200 ${
                  isOpen ? "rotate-180 text-brand-ink" : "group-hover:text-foreground"
                }`
          }
        />
      </button>

      {/* The menu, rendered via portal */}
      {isOpen &&
        portalTarget &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
            className={
              control
                ? // The menu is portaled out of the screen's own `.oats-surface`, so it
                  // carries the boundary itself: the inherited input chrome stops here.
                  "oats-surface z-9999 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
                : "z-9999 bg-popover/95 backdrop-blur-xl border border-border/70 rounded shadow-xl overflow-hidden"
            }
          >
            {showSearch &&
              (control ? (
                <div className="flex h-9 items-center gap-2 border-b border-border px-3">
                  <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("languageSelector.searchPlaceholder")}
                    className="h-full w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="px-2 pt-2 pb-1.5 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchQueryChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t("languageSelector.searchPlaceholder")}
                      className="w-full h-7 pl-7 pr-6 text-xs bg-transparent text-foreground border-0 focus:outline-none placeholder:text-muted-foreground/50"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted/50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

            {/* The language list. `relative` makes it the items' offset parent,
                which keepInView measures against. */}
            <div
              ref={listRef}
              className={
                control
                  ? "relative max-h-56 overflow-y-auto p-1"
                  : "relative max-h-48 overflow-y-auto px-1 pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border"
              }
            >
              {filteredLanguages.length === 0 ? (
                <div
                  className={
                    control
                      ? "px-2 py-1.5 text-[13px] text-muted-foreground"
                      : "px-2.5 py-2 text-xs text-muted-foreground"
                  }
                >
                  {t("languageSelector.noLanguagesFound")}
                </div>
              ) : (
                <div role="listbox" className={control ? undefined : "space-y-0.5 pt-1"}>
                  {filteredLanguages.map((language, index) => {
                    const isSelected = language.value === value;
                    const isHighlighted = index === highlightedIndex;

                    return (
                      <button
                        key={language.value}
                        type="button"
                        onClick={() => handleSelect(language.value, false)}
                        onPointerMove={(event) => {
                          const last = lastPointerRef.current;
                          if (last && last.x === event.clientX && last.y === event.clientY) return;
                          lastPointerRef.current = { x: event.clientX, y: event.clientY };
                          if (!isHighlighted) setHighlightedIndex(index);
                        }}
                        className={
                          control
                            ? cn(
                                "flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-left text-[13px] text-foreground outline-none",
                                isHighlighted && "bg-accent text-accent-foreground"
                              )
                            : `
                          group w-full flex items-center justify-between gap-2
                          h-7 px-2.5 text-left text-xs font-medium
                          rounded transition-[background-color,color,transform] duration-150 ease-out
                          ${
                            isSelected
                              ? "bg-primary/15 text-brand-ink shadow-sm"
                              : isHighlighted
                                ? "bg-muted/70 text-foreground"
                                : "text-foreground hover:bg-muted/50 active:scale-[0.98]"
                          }
                        `
                        }
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="truncate">
                          {!control && (
                            <span aria-hidden="true" className="mr-1.5">
                              {language.flag}
                            </span>
                          )}
                          {language.label}
                        </span>
                        {isSelected && (
                          <Check
                            aria-hidden="true"
                            className={control ? "size-4 shrink-0" : "w-3 h-3 shrink-0"}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          portalTarget
        )}
    </div>
  );
}
