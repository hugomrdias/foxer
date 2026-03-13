import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      dev: {
        command: 'foxer dev',
        dependsOn: ['@hugomrdias/foxer#build', '@hugomrdias/foxer#check'],
        cache: false,
      },
    },
  },
})
