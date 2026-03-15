{
  "name": "foxer-repo",
  "version": "0.0.0",
  "private": true,
  "description": "",
  "keywords": [],
  "license": "MIT",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
   "check": "turbo run check",
    "build": "turbo run build",
    "lint": "biome check ."
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.7",
    "@hugomrdias/configs": "^1.1.3",
    "turbo": "^2.8.17"
  }
}
