# Scan of Your Drawing

<p align="center">
  <img src="assets/transformation-tree-to-wings.gif" alt="A tree transforming into a winged tree" width="900">
</p>

Scan of Your Drawing is a creative experiment that turns a hand-drawn image into a living visual transformation.  
You upload a drawing and describe what you want to happen to it in a simple sentence.  
The original drawing is analyzed at the pixel level and reconstructed as a dense field of numbers, letters, and symbols.  
That data then dissolves, moves, and reorganizes instead of simply replacing the original artwork.  
An AI transformation runs in the background to interpret the requested change while keeping the original drawing as the visual reference.  
The final result is reconstructed on screen entirely from characters based on the transformed image data.  
This creates a visual loop of **DRAWING → DATA → TRANSFORMATION → DATA → DRAWING**.  
The project uses a Cloudflare Worker, Cloudflare Workers AI, and the FLUX 2 Klein model for the transformation step.  
The interface is intentionally minimal and experimental, with responsive behavior for desktop and mobile.  
The goal is to explore what happens when a human drawing becomes data, changes meaning, and comes back as something new.
