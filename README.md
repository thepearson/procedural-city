# Procedural City Generator

A real-time, procedurally generated 3D city road network built with Three.js, Vite, and custom GLSL shaders. This project simulates a self-organizing road network with dynamic environments, including a full day/night cycle and atmospheric street lighting.

![Procedural City Preview](https://via.placeholder.com/800x450.png?text=Procedural+City+Generator+Preview)

## 🚀 Features

- **Procedural Road Growth**: Implements a queue-based growth algorithm inspired by Parish & Müller's "Procedural Modeling of Cities" (2001).
    - Supports **Grid**, **Radial**, and **Organic** growth patterns.
    - Automatic intersection pruning and junction snapping.
- **Advanced Shader Rendering**:
    - Roads, footpaths, and lane markings are rendered entirely via a single optimized fragment shader.
    - Procedural terrain height mapping using layered Simplex noise.
- **Dynamic Environment**:
    - **Time of Day Cycle**: Configurable 0-24h cycle that affects sun position, sky color, and ambient lighting.
    - **Atmospheric Streetlamps**: Minimalist L-shaped lamp posts that follow terrain elevation and cast smooth, circular light pools on the ground at night.
- **Real-time Tweaking**: Interactive GUI powered by `dat.gui` to control:
    - Road density, width, and colors.
    - Footpath size and tiling.
    - Streetlamp intervals and schedules.
    - Terrain noise scale and height.

## 🛠️ Technical Stack

- **Three.js**: Core 3D engine.
- **GLSL**: Custom vertex and fragment shaders for terrain and roads.
- **TypeScript**: Type-safe application logic.
- **Vite**: Ultra-fast build tool and development server.
- **dat.gui**: User interface for parameter manipulation.

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/threejs-city2.git
   cd threejs-city2
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## 🎮 Controls

- **Orbit**: Left Click + Drag
- **Zoom**: Mouse Wheel / Pinch
- **Pan**: Right Click + Drag
- **GUI**: Use the top-right menu to regenerate the city or adjust lighting and terrain parameters.

## 📄 License

This project is licensed under the ISC License.
