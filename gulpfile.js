const gulp = require('gulp');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const shell = require('gulp-shell');
const browserify = require('browserify');
const rename = require('gulp-rename');
const del = require('del');
const watch = require('gulp-watch');
const gulpif = require('gulp-if');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const merge2 = require('merge2');
const mkdirp = require('mkdirp');
const postcss = require('gulp-postcss');
const { exec } = require('child_process');
const nodeJS = process.execPath;

// Scripts paths.
const paths = {
  vendorScripts: [
    'vendor/liquid.js'
  ],
  app: [
    'app/**/**/*.js'
  ],
  test: [
  'test/**/*.{js, json}',
  'test/index.html',
  '!test/lib/index.js' // built test file
  ],
  templates: [
    'templates/**/*.html'
  ],
  css: [
    'style/**/*.css'
  ]
};

function isProd () {
  return process.env.PROSE_ENV === 'production';
}

gulp.task('setProductionEnv', function (done) {
  process.env.PROSE_ENV = 'production';
  done();
});

const dist = './dist';
const dev = './';

// Removes `dist` folder.
gulp.task('clean', async function (cb) {
  await del([dist], cb);
});

// Translations.
// To run this task we have to have a `transifex.auth`
// file inside `translations` folder.
// Example file contents:
//
//  {
//    "user": "",
//    "pass": ""
//  }
//
// An account can be created at https://www.transifex.com/
//
gulp.task('translations', function () {
  mkdirp(dist);
  return new Promise((res, rej) => {
    exec('"' + nodeJS + '"' + ' translations/update_locales', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error (updating translation locales): ${error}`);
        return rej(error);
      }
      exec('"' + nodeJS + '"' + ' build', (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return rej(error);
        }
        res();
      });
    })
  });
});

// Parse stylesheet
gulp.task('css', function () {
  return gulp.src('./style/style.css')
    .pipe(
      postcss([
        require('postcss-import')({ root: process.cwd() + '/styles' })
      ])
        .on('error', (err) => { console.error(err) })
    )
    .pipe(rename('prose.css'))
    .pipe(gulp.dest(dist));
});

// Build templates.
gulp.task('templates', function () {
  mkdirp(dist);
  return new Promise((res, rej) => {
    exec('"' + nodeJS + '"' + ' build', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return rej(error);
      }
      res();
    });
  });
});

// Creates `dist` directory if not created and
// creates `oauth.json`.
gulp.task('oauth', function () {
  mkdirp(dist);
  return new Promise((res, rej) => {
    exec('[ -f oauth.json ] && echo "Using existing oauth.json." || curl "https://raw.githubusercontent.com/prose/prose/gh-pages/oauth.json" > oauth.json', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return rej(error);
      }
      res();
    });
  });
});

// Build tests, then concatenate with vendor scripts
gulp.task('build-tests', gulp.series('templates', 'oauth', function() {
  const tests = browserify({
    debug: true,
    noParse: [require.resolve('handsontable/dist/handsontable.full')]
  })
  .add('./test/index.js')
  .external(['chai', 'mocha'])
  .bundle()
  .pipe(source('index.js'))
  .pipe(buffer());

  return merge2(gulp.src(paths.vendorScripts), tests)
  .pipe(concat('index.js'))
  .pipe(gulp.dest('./test/lib'));
}));

// Browserify app scripts, then concatenate with vendor scripts into `prose.js`.
gulp.task('build-app', gulp.series('templates', 'oauth', function() {
  const app = browserify({
    noParse: [require.resolve('handsontable/dist/handsontable.full')]
  })
  .add('./app/boot.js')
  .bundle()
  .pipe(source('app.js'))
  .pipe(buffer());

  return merge2(gulp.src(paths.vendorScripts), app)
  .pipe(concat('prose.js'))
  .pipe(gulpif(isProd(), uglify()))
  .pipe(gulp.dest(dist));
}));

// Watch for changes in `app` scripts.
gulp.task('watch', gulp.series('build-app', 'build-tests', 'css', function() {
  // Watch any `.js` file under `app` folder.
  gulp.watch(paths.app, gulp.series('build-app', 'build-tests'));
  gulp.watch(paths.test, gulp.series('build-tests'));
  gulp.watch(paths.templates, gulp.series('build-app'));
  return gulp.watch(paths.css, gulp.series('css'));
}));

const testTask = shell.task([
  './node_modules/mocha-phantomjs/bin/mocha-phantomjs test/index.html'
]);

gulp.task('test', gulp.series('build-tests', testTask));

// Build site, tests
gulp.task('build', gulp.series('build-tests', 'build-app', 'css'));
gulp.task('default', gulp.series('build'));

// Minify build
gulp.task('production', gulp.series('setProductionEnv', 'build'));
