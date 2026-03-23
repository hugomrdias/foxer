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
    "check": "biome check .",
    "build": "turbo run build",
    "lint:fix": "biome check --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.8",
    "typescript": "^5.9.3"
  }
}
