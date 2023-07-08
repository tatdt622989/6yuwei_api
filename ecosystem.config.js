module.exports = {
  apps: [{
    name: 'app',
    script: './app.js',
    instances: 'max',
    exec_mode: 'cluster',
    watch: true,
    ignore_watch: ['node_modules', 'logs', 'uploads', '*.log'],
  }],
};
