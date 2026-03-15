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
    "check": "vp run --cache -r check",
    "build": "vp run --cache -r build",
    "prepare": "vp config"
  },
  "devDependencies": {
    "vite-plus": "latest"
  }
}
