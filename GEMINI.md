# Procedural City Generator - GEMINI Context

This project is a procedural 3D city generator built with Three.js, Vite, and TypeScript. It features a road network generator based on the "Procedural Modeling of Cities" (Parish & Müller, 2001) paper, rendered entirely via a fragment shader on a procedural ground plane.

## Project Overview

- **Core Technology**: Three.js for 3D rendering.
- **Build System**: Vite for fast development and bundling.
- **Language**: TypeScript for type-safe application logic.
- **Shaders**: GLSL fragment shaders for high-performance procedural rendering of roads (highways/streets), lane markings, and grass.
- **UI**: `dat.gui` for real-time parameter tweaking (pattern, density, width, etc.).

## Architecture

- `src/main.ts`: The main application loop, scene initialization, and the `RoadGenerator` class implementation.
- `src/shaders/ground.frag.glsl`: The complex procedural shader that calculates distances to road segments and renders asphalt, center lines, and lane markings.
- `src/shaders/ground.vert.glsl`: Standard vertex shader for the ground plane.
- `RoadGenerator`: A queue-based "Self-Organizing Road Network" algorithm that handles:
    - **Global Goals**: Grid (Manhattan style), Radial (Paris style), and Organic patterns.
    - **Local Constraints**: Automatic intersection pruning and junction snapping for a realistic network graph.
    - **Road Types**: Distinction between 4-lane Highways and 2-lane Streets.

## Building and Running

- **Development**: `npm run dev`
- **Build**: `npm run build` (Compiles TS and bundles via Vite)
- **Preview**: `npm run preview`

## Development Conventions

- **Module System**: Uses ES Modules (`"type": "module"`).
- **Shader Imports**: Shaders are imported directly as strings in TypeScript using `vite-plugin-glsl`.
- **TypeScript**: Strict mode is enabled. Use non-null assertions (`!`) carefully when accessing shader uniforms as they are initialized asynchronously or dynamically.
- **Procedural Workflow**: Changes to the road network logic should be mirrored in the fragment shader's uniform arrays (currently capped at 256 segments).
