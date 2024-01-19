import ora from 'ora';
import path from 'path';

const youtubedl = require('youtube-dl-exec');

/**
 * Download Youtube subtitles and rename them to be the same as Youtube video
 * file name
 * @param {string} videoId Youtube Video Id
 * @param {string} filenameYoutube Youtube filename (without extension)
 * @param {string} targetDir target directory
 */
export default async function downloadYoutubeSubtitles(videoId, filenameYoutube, targetDir) {
  if (!videoId || !videoId.trim()) {
    return null;
  }

  const spinnerSubtitles = ora(`Download subtitles for ${filenameYoutube}`).start();
  const urlYoutube = `https://www.youtube.com/watch?v=${videoId}`;

  const ytOptions = {};
  ytOptions.writeSub = true;
  ytOptions.subFormat = 'srt';
  ytOptions.skipDownload = true;
  ytOptions.subLang = 'en.*';
  ytOptions.output = path.join(targetDir, `${filenameYoutube}.vtt`);
  const subtitles = [];
  const srclang = ytOptions.subLang;
  await youtubedl.exec(urlYoutube, ytOptions)
    .then(() => {
      console.log('Download subtitle completed:', filenameYoutube);
      subtitles.push({
        src: `${filenameYoutube}${ytOptions.subFormat}`,
        srclang,
        default: (srclang.toLowerCase() === 'en' || srclang.toLowerCase() === 'en-us'),
      });
      spinnerSubtitles.succeed();
    }).catch((err) => {
      console.error('Error:', err);
      spinnerSubtitles.fail();
    });
  return subtitles;
}
