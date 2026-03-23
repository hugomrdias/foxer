{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "futureFlags": {
    "watchUsingTaskInputs": true
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "check": {
      "dependsOn": ["build","^check"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true,
      "interruptible": true
    }
  }
}
