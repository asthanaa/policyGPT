# Policy and SOP Copilot

Policy and SOP Copilot is a lightweight retrieval-augmented generation (RAG) demo for asking grounded questions over synthetic policy and SOP PDF documents. It extracts text from PDFs, chunks the content for semantic retrieval, stores embeddings in FAISS, and serves answers through a Streamlit interface with source chunk citations. The repository now also includes a GitHub Pages-compatible static site under `docs/` for browser-based use when a Python host is not available.

## Tech Stack

- Python
- Streamlit
- OpenAI API
- FAISS
- PyMuPDF
- NumPy and Pandas

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

   ```bash
   python3 -m pip install -r requirements.txt
   ```

3. Create a local `.env` file with your OpenAI API key and local app credentials:

   ```env
   OPENAI_API_KEY=your_api_key_here
   APP_USERNAME=your_app_username
   APP_PASSWORD=your_app_password
   ```

   The login credentials stay local in `.env` and are not committed to GitHub.

4. Prepare the retrieval assets:

   ```bash
   python3 app/extract_pdfs.py
   python3 app/chunk_pdfs.py
   python3 app/build_index.py
   ```

## Run The Streamlit App

```bash
python3 -m streamlit run app/streamlit_app.py
```

The app opens with a sign-in screen before the upload and Q&A workflow is available.

## GitHub Pages Deployment

The `docs/` folder contains a static browser version of the app that can be deployed through GitHub Pages. It keeps the same broad workflow, but the implementation is different from the Streamlit build:

- PDFs are parsed in the browser with PDF.js.
- Retrieval is done locally in the browser with lexical chunk scoring instead of FAISS.
- The OpenAI API key is entered at runtime in the browser instead of being stored on the server.

### Default Login For The Pages Build

The static site ships with a client-side login gate configured in `docs/site-config.js`.

- Username: `asthanaa`
- Password: `asthana15`

Before publishing publicly, replace those values. The password is stored as a SHA-256 hash, not in plain text. To generate a new hash:

```bash
printf 'your-new-password' | shasum -a 256
```

Then update `docs/site-config.js`.

### Important Limitation

GitHub Pages is static hosting, so it cannot provide true server-side authentication or safely hold an OpenAI API key. The Pages login screen is only a lightweight browser-side barrier. Anyone who needs to ask questions must still enter a valid OpenAI API key in the app UI at runtime.

### Publishing

This repository includes `.github/workflows/deploy-pages.yml`, which deploys the `docs/` folder through GitHub Actions. After pushing to `main`, make sure GitHub Pages is enabled in the repository settings with the source set to GitHub Actions.
