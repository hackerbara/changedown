export default {
  paths: ['features/**/*.feature'],
  import: ['out/features/steps/**/*.js'],
  format: ['progress-bar'],
  tags: process.env.CUCUMBER_TAGS || '',
  publishQuiet: true,
};
