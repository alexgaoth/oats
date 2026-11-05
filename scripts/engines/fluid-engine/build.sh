#!/bin/zsh
# Build the FluidAudio engine with swiftc, for a machine where `swift build` does
# not run. usage: build.sh <work dir> <output binary>
# Takes FluidAudio v0.18.2 (Apache-2.0) from GitHub. The first -O build takes minutes.
set -e
work=$1; out=$2
here=${0:A:h}
sdk=${SDKROOT:-$(xcrun --show-sdk-path)}
mkdir -p $work && cd $work
[[ -d FluidAudio ]] || git clone --depth 1 --branch v0.18.2 https://github.com/FluidInference/FluidAudio.git
fa=FluidAudio/Sources
clang -O2 -c $fa/MachTaskSelfWrapper/MachTaskSelf.c -I $fa/MachTaskSelfWrapper/include -isysroot $sdk -o MachTaskSelf.o
clang++ -O2 -std=c++17 -c $fa/FastClusterWrapper/FastClusterWrapper.cpp -I $fa/FastClusterWrapper/include -isysroot $sdk -o FastCluster.o
swiftc -O -swift-version 5 -parse-as-library -module-name LuxTtsG2pResources -target arm64-apple-macos15.0 -sdk $sdk \
  -emit-module -emit-library -static -o libLux.a $fa/LuxTtsG2pResources/*.swift
find $fa/FluidAudio -name '*.swift' > files.txt
mkdir -p opt
swiftc -O -wmo -swift-version 5 -parse-as-library -module-name FluidAudio -target arm64-apple-macos15.0 -sdk $sdk \
  -I . -I $fa/FastClusterWrapper/include -I $fa/MachTaskSelfWrapper/include -D Diarizer -D TTS \
  -emit-module -emit-module-path opt/FluidAudio.swiftmodule -emit-library -static -o opt/libFluidAudio.a @files.txt -j8
swiftc -O -swift-version 5 -parse-as-library -target arm64-apple-macos15.0 -sdk $sdk \
  -I opt -I . -I $fa/FastClusterWrapper/include -I $fa/MachTaskSelfWrapper/include \
  $here/engine.swift opt/libFluidAudio.a libLux.a MachTaskSelf.o FastCluster.o \
  -lc++ -framework CoreML -framework Accelerate -framework AVFoundation -o $out
