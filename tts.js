// This is a Vercel serverless function that acts as a proxy for the Google Translate TTS service.
// It takes 'text' and 'lang' as query parameters and returns the audio stream.
// This is necessary to avoid CORS issues when deploying the app to a live domain.

module.exports = async (req, res) => {
  const { text, lang = 'ta' } = req.query; // Default to Tamil ('ta') if no lang is specified.

  if (!text) {
    return res.status(400).send('Text query parameter is required');
  }

  // Construct the Google Translate TTS URL.
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=${lang}&client=tw-ob`;

  try {
    // Fetch the audio from Google's service.
    // We add a User-Agent header to mimic a browser request.
    const googleResponse = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
      },
    });

    // Check if the request to Google was successful.
    if (!googleResponse.ok) {
      console.error(`Google TTS fetch failed with status: ${googleResponse.status}`);
      return res.status(googleResponse.status).send('Failed to fetch TTS from Google');
    }

    // Get the audio data as a buffer.
    const arrayBuffer = await googleResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Send the audio data back to the client with the correct headers.
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (error) {
    console.error('TTS proxy error:', error);
    res.status(500).send('Internal Server Error');
  }
};
