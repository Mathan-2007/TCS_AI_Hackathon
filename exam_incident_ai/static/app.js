const form = document.getElementById('analyze-form');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const imageWrap = document.getElementById('image-wrap');
const sampleSelect = document.getElementById('sample-select');

const apiUrl = (path) => {
  if (window.location.protocol === 'file:') {
    return `http://127.0.0.1:8000${path}`;
  }
  return path;
};

async function loadSamples() {
  try {
    const res = await fetch(apiUrl('/api/samples'));
    if (!res.ok) {
      throw new Error(`Failed to load samples (${res.status})`);
    }
    const items = await res.json();
    items.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      sampleSelect.appendChild(option);
    });
  } catch (err) {
    console.error(err);
    setStatus('Open the AI page through http://127.0.0.1:8000 instead of opening index.html directly.', 'error');
    resultEl.textContent = 'Failed to load built-in samples. Start the Flask app and open the page via the local server URL.';
  }
}

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  setStatus('Running the incident model…', 'success');
  resultEl.textContent = 'Processing…';
  imageWrap.classList.add('hidden');
  imageWrap.innerHTML = '';

  try {
    const res = await fetch(apiUrl('/api/analyze'), {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || 'Analysis failed');
    }

    setStatus('Analysis complete.', 'success');
    resultEl.textContent = data.output || 'No output returned.';

    if (data.image) {
      const img = document.createElement('img');
      img.src = apiUrl(data.image);
      img.alt = 'Incident timeline';
      imageWrap.appendChild(img);
      imageWrap.classList.remove('hidden');
    }
  } catch (err) {
    setStatus(err.message, 'error');
    resultEl.textContent = err.message;
  }
});

loadSamples();
