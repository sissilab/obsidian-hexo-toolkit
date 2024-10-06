# Obsidian Hexo Toolkit

**Obsidian Hexo Toolkit** is an Obsidian plugin that enables users to maintain their [Hexo](https://hexo.io/) posts in Obsidian. 

# Features

## Export Hexo-compatible Markdown

Users can write their posts in Obsidian and use this plugin to convert markdown posts to Hexo-compatible Markdown. We know Obsidian Markdown cannot be directly used in Hexo Markdown, because of some special syntax features that are only supported by Obsidian.

1. Extract Hexo [Front-matter](https://hexo.io/docs/front-matter)
2. Convert internal title links, e.g. `[[# Chapter One]]`, ...
3. Convert image formats, e.g. `![[Engelbart.jpg]]`, `![[Engelbart.jpg|100x145]]`, `![Engelbart|50](Engelbart.jpg)`, ...
4. Convert embedded Excalidraw images (e.g. `![[test.excalidraw]]`) to svg

## Image Hosting Services

Users can set up Image Hosting Services to maintain the images of posts.

### Local

When you convert a post in Obsidian using **Local** image service, all local images in the post should be copied to Hexo manually.

### Smms (SM.MS)

When you convert a post in Obsidian using **Smms (SM.MS)** image service, all local images in the post will be uploaded to SM.MS automatically.

# Usage

Open command palette (default `Ctrl+F9`) to search and execute `Hexo Converter (Obsidian -> Hexo)`, the conversion completes successfully when you see `Hexo: Success 🎉` on the bottom-right status bar. And now, you can click this status and a 'Hexo Conversion Result' window will be popped up.
