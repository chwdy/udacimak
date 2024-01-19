import fs from 'fs-extra';
import path from 'path';
import {
  downloadYoutubeSubtitles,
  filenamify,
  findVideoLocalSubtitles,
  logger,
} from '.';

const youtubedl = require('youtube-dl-exec');
const ora = require('ora');


/**
 * Download youtube video and save locally
 * @param {string} videoId Youtube video id to construct download url
 * @param {string} outputPath directory to save the file
 * @param {string} prefix file prefix
 * @param {string} title title of atom
 * @param {string} format youtube-dl quality setting (eg. best)
 */
export default function downloadYoutube(videoId, outputPath, prefix, title) {
  return new Promise(async (resolve, reject) => {
    if (!videoId) {
      resolve(null);
      return;
    }

    const filenameBase = `${prefix}. ${filenamify(title || '')}-${videoId}`;
    const filenameYoutube = `${filenameBase}.mp4`;
    const savePath = path.join(outputPath, filenameYoutube); `${outputPath}/${filenameYoutube}`;

    // avoid re-downloading videos if it already exists
    if (fs.existsSync(savePath)) {
      logger.info(`Video already exists. Skip downloading ${savePath}`);
      const subtitles = findVideoLocalSubtitles(filenameBase, outputPath);
      resolve({
        src: filenameYoutube,
        subtitles,
      });
      return;
    }

    // start youtube download
    const ytVideoQualities = ['22', '18', ''];
    for (let i = 0; i < ytVideoQualities.length; i += 1) {
      try {
        // eslint-disable-next-line no-use-before-define
        const dlPromise = await downloadYoutubeHelper(videoId, outputPath, prefix, title,
          ytVideoQualities[i]);
        resolve(dlPromise);
        break;
      } catch (error) {
        if (i < ytVideoQualities.length - 1) {
          logger.error(`Failed to download youtube video with id ${videoId} with quality="${ytVideoQualities[i]}", retrying with quality="${ytVideoQualities[i + 1]}"`);
        } else {
          const { message } = error;

          if (!message) {
            reject(error);
            return;
          }

          // handle video unavailable error. See node-youtube-dl source code for
          // error message strings to check
          if (message.includes('video is unavailable')) {
            logger.error(`Youtube video with id ${videoId} is unavailable. It may have been deleted. The CLI will ignore this error and skip this download.`);
            resolve(null);
          } else if (message.includes('video has been removed by the user')) {
            logger.error(`Youtube video with id ${videoId} has been removed by the user. The CLI will ignore this error and skip this download.`);
            resolve(null);
          } else if (message.includes('sign in to view this video')) {
            logger.error(`Youtube video with id ${videoId} is private and require user to sign in to access it. The CLI will ignore this error and skip this download.`);
            resolve(null);
          } else if (message.includes('video is no longer available')) {
            logger.error(`Youtube video with id ${videoId} is no longer available. The CLI will ignore this error and skip this download.`);
            resolve(null);
          } else {
            logger.error(`Youtube video with id ${videoId} could not be downloaded available. The CLI will ignore this error and skip this download. Please check this error message:\n\n${JSON.stringify(message)} ==END==`);
            resolve(null);
          }
        }
      }
    }
  }); //.return Promise
}
async function downloadVideo(videoId, urlYoutube, argsYoutube, tempPath, savePath) {
  const spinnerInfo = ora(`Getting Youtube video (id=${videoId}) information`).start();

  try {
    await youtubedl(urlYoutube, {
      output: tempPath,
      ...argsYoutube,
    }).then((output) => {
      console.log('Download completed:', output);
      spinnerInfo.succeed();
    }).catch((err) => {
      console.error('Error:', err);
      spinnerInfo.fail();
    });
    console.log('urlYoutube', urlYoutube);
    console.log('argsYoutube', argsYoutube);
    console.log('tempPath', tempPath);
    console.log('savePath', savePath);
    return {
      src: urlYoutube,
      subtitles: [], // Placeholder for subtitles
    };
  } catch (error) {
    // spinnerInfo.fail();
    logger.error(error);
    throw error; // Rethrow or handle the error as needed
  }
}

function downloadYoutubeHelper(videoId, outputPath, prefix, title, format) {
  return new Promise(async (resolve, reject) => {
    const filenameBase = `${prefix}. ${filenamify(title || '')}-${videoId}`;
    const filenameYoutube = `${filenameBase}.mp4`;
    const urlYoutube = `https://www.youtube.com/watch?v=${videoId}`;
    const tempPath = path.join(outputPath, `.${filenameYoutube}`);
    const savePath = path.join(outputPath, filenameYoutube); `${outputPath}/${filenameYoutube}`;

    let timeGap;
    let timeout = 0;

    const argsYoutube = {};
    if (format) {
      argsYoutube.format = format;
    }
    if (global.ytVerbose) {
      argsYoutube.verbose = true;
    }
    argsYoutube.mergeOutputFormat = 'mp4';
    // argsYoutube.ext = 'Mp4';

    // calculate amount of time to wait before starting this next Youtube download
    if (global.previousYoutubeTimestamp) {
      // time difference between last Youtube download and this one
      timeGap = Date.now() - global.previousYoutubeTimestamp;
      const delayYoutube = global.delayYoutube * 1000;

      if (timeGap > 0 && timeGap <= delayYoutube) {
        timeout = delayYoutube - timeGap;
      } else {
        timeout = 0;
      }
    }

    // delay to avoid Youtube from detecting youtube-dl usage
    await new Promise((resolveWait) => {
      const timeoutSeconds = parseFloat(timeout / 1000).toFixed(1);
      const spinnerDelayYoutube = ora(`Delaying Youtube download for further ${timeoutSeconds} seconds`).start();
      setTimeout(() => {
        spinnerDelayYoutube.stop();
        resolveWait();
      }, timeout);
    });

    await downloadVideo(videoId, urlYoutube, argsYoutube, tempPath, savePath)
      .then((result) => {
        console.log('Download complete:', result);
      })
      .catch((error) => {
        console.error('Download failed:', error);
        reject(error);
      });

    logger.info(`Downloaded video ${filenameYoutube} with quality="${format}"`);
    try {
      await fs.rename(tempPath, savePath);
    } catch (errorRename) {
      console.error(`FS error,${errorRename}`);
      reject(errorRename);
    }


    let subtitles = [];
    if (global.downloadYoutubeSubtitles) {
      try {
        subtitles = await downloadYoutubeSubtitles(videoId, filenameBase, outputPath);
      } catch (error) {
        logger.warn(error);
      }
    } //.if downloadYoutubeSubtitles

    global.previousYoutubeTimestamp = Date.now();
    resolve({
      src: filenameYoutube,
      subtitles,
    });
  });
}
