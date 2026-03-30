import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const CONFIG = window.POLICY_GPT_CONFIG ?? {};
const SESSION_FLAG = "policygpt-pages-authenticated";
const SESSION_USERNAME = "policygpt-pages-username";
const ANSWER_MODEL = CONFIG.openai?.model ?? "gpt-4.1-mini";
const MAX_OUTPUT_TOKENS = CONFIG.openai?.maxOutputTokens ?? 600;

const EXAMPLE_QUESTIONS = [
  "What is the purpose of this document?",
  "What approvals or sign-offs are required?",
  "What deadlines or timelines are mentioned?",
  "What evidence is needed before closure?",
];

const DEVELOPER_PROMPT = [
  "You answer questions about policy and SOP documents using only the retrieved context provided.",
  "",
  "Rules:",
  "- Use only the supplied context chunks.",
  "- If the answer is not supported by the context, say that the documents do not provide enough evidence.",
  "- Cite factual claims with bracketed chunk references like [1] or [2].",
  "- Use only citation numbers that appear in the provided context.",
  "- Do not invent policy details, timelines, approvals, or citations.",
  "- Keep the answer concise, practical, and easy to read.",
].join("\n");

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
  "within",
  "will",
  "would",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "may",
  "might",
  "than",
  "then",
  "there",
  "here",
  "your",
  "our",
  "about",
  "after",
  "before",
  "during",
  "under",
  "over",
  "through",
  "across",
  "only",
  "right",
  "now",
  "not",
  "one",
  "two",
  "three",
  "these",
  "those",
  "them",
  "they",
  "you",
]);

const state = {
  authenticated: false,
  corpus: [],
  documents: [],
  retrievalStats: {
    averageLength: 0,
    docFrequencies: new Map(),
    totalDocs: 0,
  },
  history: [],
};

const elements = {
  authView: document.querySelector("#authView"),
  workspace: document.querySelector("#workspace"),
  loginForm: document.querySelector("#loginForm"),
  usernameInput: document.querySelector("#usernameInput"),
  passwordInput: document.querySelector("#passwordInput"),
  loginStatus: document.querySelector("#loginStatus"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  modelInput: document.querySelector("#modelInput"),
  topKInput: document.querySelector("#topKInput"),
  topKValue: document.querySelector("#topKValue"),
  exampleButtons: document.querySelector("#exampleButtons"),
  corpusSummary: document.querySelector("#corpusSummary"),
  documentList: document.querySelector("#documentList"),
  pdfInput: document.querySelector("#pdfInput"),
  processButton: document.querySelector("#processButton"),
  uploadStatus: document.querySelector("#uploadStatus"),
  qaForm: document.querySelector("#qaForm"),
  questionInput: document.querySelector("#questionInput"),
  askButton: document.querySelector("#askButton"),
  qaStatus: document.querySelector("#qaStatus"),
  historyList: document.querySelector("#historyList"),
  emptyState: document.querySelector("#emptyState"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  logoutButton: document.querySelector("#logoutButton"),
};

initialize();

function initialize() {
  configureControls();
  renderExampleButtons();
  bindEvents();
  restoreSession();
  updateWorkspace();
}

function configureControls() {
  const retrievalConfig = CONFIG.retrieval ?? {};
  elements.modelInput.value = ANSWER_MODEL;
  elements.topKInput.min = String(retrievalConfig.minTopK ?? 3);
  elements.topKInput.max = String(retrievalConfig.maxTopK ?? 8);
  elements.topKInput.step = "1";
  elements.topKInput.value = String(retrievalConfig.defaultTopK ?? 5);
  elements.topKValue.value = elements.topKInput.value;
  elements.topKValue.textContent = elements.topKInput.value;
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.topKInput.addEventListener("input", () => {
    elements.topKValue.value = elements.topKInput.value;
    elements.topKValue.textContent = elements.topKInput.value;
  });
  elements.processButton.addEventListener("click", handleProcessDocuments);
  elements.qaForm.addEventListener("submit", handleAskQuestion);
  elements.clearHistoryButton.addEventListener("click", clearHistory);
  elements.logoutButton.addEventListener("click", logout);
}

function getConfiguredCredentials() {
  const configuredCredentials = CONFIG.auth?.credentials;
  if (Array.isArray(configuredCredentials) && configuredCredentials.length > 0) {
    return configuredCredentials;
  }

  const username = CONFIG.auth?.username;
  const passwordHash = CONFIG.auth?.passwordHash;
  if (username && passwordHash) {
    return [{ username, passwordHash }];
  }

  return [];
}

function usernameIsConfigured(username) {
  return getConfiguredCredentials().some((credential) => credential.username === username);
}

function restoreSession() {
  const authenticatedFlag = sessionStorage.getItem(SESSION_FLAG);
  if (authenticatedFlag !== "true") {
    return;
  }

  const username = sessionStorage.getItem(SESSION_USERNAME);
  if (!usernameIsConfigured(username ?? "")) {
    sessionStorage.removeItem(SESSION_FLAG);
    sessionStorage.removeItem(SESSION_USERNAME);
    return;
  }

  state.authenticated = true;
}

async function handleLogin(event) {
  event.preventDefault();

  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;

  if (!username || !password) {
    setStatus(elements.loginStatus, "Enter both username and password.", "error");
    return;
  }

  setStatus(elements.loginStatus, "Checking credentials...", "warn");

  const configuredCredentials = getConfiguredCredentials();

  try {
    const submittedHash = await sha256(password);
    const credentialsMatch = configuredCredentials.some(
      (credential) =>
        username === credential.username && submittedHash === credential.passwordHash,
    );

    if (!credentialsMatch) {
      setStatus(elements.loginStatus, "Invalid username or password.", "error");
      return;
    }
  } catch (error) {
    setStatus(elements.loginStatus, `Login failed: ${error.message}`, "error");
    return;
  }

  state.authenticated = true;
  sessionStorage.setItem(SESSION_FLAG, "true");
  sessionStorage.setItem(SESSION_USERNAME, username);
  elements.passwordInput.value = "";
  setStatus(elements.loginStatus, "", "");
  updateWorkspace();
}

function logout() {
  state.authenticated = false;
  state.corpus = [];
  state.documents = [];
  state.history = [];
  state.retrievalStats = {
    averageLength: 0,
    docFrequencies: new Map(),
    totalDocs: 0,
  };

  sessionStorage.removeItem(SESSION_FLAG);
  sessionStorage.removeItem(SESSION_USERNAME);

  elements.apiKeyInput.value = "";
  elements.passwordInput.value = "";
  elements.questionInput.value = "";
  elements.pdfInput.value = "";

  setStatus(elements.uploadStatus, "", "");
  setStatus(elements.qaStatus, "", "");
  updateWorkspace();
}

function clearHistory() {
  state.history = [];
  renderHistory();
  setStatus(elements.qaStatus, "Question history cleared.", "success");
}

function updateWorkspace() {
  elements.authView.hidden = state.authenticated;
  elements.workspace.hidden = !state.authenticated;
  renderCorpusSummary();
  renderHistory();
}

function renderExampleButtons() {
  elements.exampleButtons.innerHTML = "";

  EXAMPLE_QUESTIONS.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example-button";
    button.textContent = question;
    button.addEventListener("click", () => {
      elements.questionInput.value = question;
      elements.questionInput.focus();
    });
    elements.exampleButtons.appendChild(button);
  });
}

async function handleProcessDocuments() {
  const files = Array.from(elements.pdfInput.files ?? []);
  if (!files.length) {
    setStatus(elements.uploadStatus, "Upload at least one PDF before processing.", "error");
    return;
  }

  const invalidFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".pdf"));
  if (invalidFiles.length) {
    setStatus(
      elements.uploadStatus,
      `Only PDF files are supported. Remove: ${invalidFiles.map((file) => file.name).join(", ")}`,
      "error",
    );
    return;
  }

  elements.processButton.disabled = true;
  setStatus(
    elements.uploadStatus,
    "Extracting text and building the in-browser corpus. Large PDFs can take a moment.",
    "warn",
  );

  try {
    const documents = [];
    const allChunks = [];
    const warnings = [];

    for (const file of files) {
      let processedDocument;
      try {
        processedDocument = await extractDocument(file);
      } catch (error) {
        warnings.push(`${file.name}: could not be read as a PDF (${error.message})`);
        continue;
      }

      if (!processedDocument.pages.length) {
        warnings.push(`${file.name}: no extractable text was found`);
        continue;
      }

      const chunks = createChunksForDocument(processedDocument);
      if (!chunks.length) {
        warnings.push(`${file.name}: extracted text was too short to build search chunks`);
        continue;
      }

      documents.push({
        name: processedDocument.name,
        pageCount: processedDocument.pageCount,
        chunkCount: chunks.length,
      });
      allChunks.push(...chunks);
    }

    if (!allChunks.length) {
      throw new Error(
        "None of the uploaded PDFs produced searchable content. The previous session corpus was kept.",
      );
    }

    buildRetrievalStats(allChunks);
    state.documents = documents;
    state.corpus = allChunks;
    state.history = [];

    const successMessage = `Processed ${documents.length} PDF(s) into ${allChunks.length} chunks.`;
    const warningMessage = warnings.length ? ` Warnings: ${warnings.join(" | ")}` : "";
    setStatus(
      elements.uploadStatus,
      `${successMessage}${warningMessage}`,
      warnings.length ? "warn" : "success",
    );
    setStatus(elements.qaStatus, "", "");
    renderCorpusSummary();
    renderHistory();
  } catch (error) {
    setStatus(elements.uploadStatus, error.message, "error");
  } finally {
    elements.processButton.disabled = false;
  }
}

async function extractDocument(file) {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdfDocument = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = normalizeWhitespace(textContent.items.map((item) => item.str ?? "").join(" "));

    if (!text) {
      continue;
    }

    pages.push({
      pageNumber,
      text,
    });
  }

  return {
    name: file.name,
    pageCount: pdfDocument.numPages,
    pages,
  };
}

function createChunksForDocument(document) {
  const retrievalConfig = CONFIG.retrieval ?? {};
  const chunkSize = retrievalConfig.chunkSizeWords ?? 180;
  const chunkOverlap = retrievalConfig.chunkOverlapWords ?? 40;
  const minChunkWords = retrievalConfig.minChunkWords ?? 40;
  const stride = Math.max(chunkSize - chunkOverlap, 1);
  const chunks = [];

  document.pages.forEach((page) => {
    const words = page.text.split(/\s+/).filter(Boolean);
    if (!words.length) {
      return;
    }

    for (let start = 0; start < words.length; start += stride) {
      const slice = words.slice(start, start + chunkSize);
      if (slice.length < minChunkWords && start !== 0) {
        break;
      }

      const text = slice.join(" ").trim();
      const tokens = tokenize(text);
      if (!tokens.length) {
        continue;
      }

      const termFrequencies = countTerms(tokens);
      chunks.push({
        chunkId: `${slugify(document.name)}-p${page.pageNumber}-c${chunks.length + 1}`,
        sourceFile: document.name,
        documentTitle: stripFileExtension(document.name),
        pageNumber: page.pageNumber,
        text,
        tokens,
        tokenCount: tokens.length,
        termFrequencies,
      });

      if (start + chunkSize >= words.length) {
        break;
      }
    }
  });

  return chunks;
}

function buildRetrievalStats(chunks) {
  const docFrequencies = new Map();
  let totalLength = 0;

  chunks.forEach((chunk) => {
    totalLength += chunk.tokenCount;
    const uniqueTerms = new Set(chunk.tokens);
    uniqueTerms.forEach((term) => {
      docFrequencies.set(term, (docFrequencies.get(term) ?? 0) + 1);
    });
  });

  state.retrievalStats = {
    averageLength: chunks.length ? totalLength / chunks.length : 0,
    docFrequencies,
    totalDocs: chunks.length,
  };
}

function renderCorpusSummary() {
  if (!state.documents.length) {
    elements.corpusSummary.textContent = "Upload and process PDFs to activate the corpus.";
    elements.documentList.innerHTML = "";
    return;
  }

  const documentCount = state.documents.length;
  const chunkCount = state.corpus.length;
  elements.corpusSummary.textContent = `Active corpus: ${documentCount} PDF(s) and ${chunkCount} chunks.`;
  elements.documentList.innerHTML = "";

  state.documents.forEach((documentRecord) => {
    const chip = document.createElement("span");
    chip.className = "document-chip";
    chip.textContent =
      `${documentRecord.name} · ${documentRecord.pageCount} page(s) · ` +
      `${documentRecord.chunkCount} chunks`;
    elements.documentList.appendChild(chip);
  });
}

async function handleAskQuestion(event) {
  event.preventDefault();

  const apiKey = elements.apiKeyInput.value.trim();
  const question = elements.questionInput.value.trim();
  const topK = Number.parseInt(elements.topKInput.value, 10);
  const model = elements.modelInput.value.trim() || ANSWER_MODEL;

  if (!apiKey) {
    setStatus(elements.qaStatus, "Enter an OpenAI API key before asking a question.", "error");
    return;
  }

  if (!state.corpus.length) {
    setStatus(elements.qaStatus, "Process PDFs before asking a question.", "error");
    return;
  }

  if (!question) {
    setStatus(elements.qaStatus, "Enter a question.", "error");
    return;
  }

  const retrievedChunks = retrieveChunks(question, topK);
  if (!retrievedChunks.length) {
    setStatus(
      elements.qaStatus,
      "No relevant chunks were found in the processed PDFs for that question.",
      "warn",
    );
    return;
  }

  elements.askButton.disabled = true;
  setStatus(elements.qaStatus, "Drafting a grounded answer with the uploaded context...", "warn");

  try {
    const answer = await requestGroundedAnswer({
      apiKey,
      question,
      model,
      chunks: retrievedChunks,
    });

    state.history.unshift({
      question,
      model,
      topK,
      answer,
      retrievedChunks,
      createdAt: new Date().toLocaleString(),
    });

    renderHistory();
    setStatus(elements.qaStatus, "Answer generated successfully.", "success");
  } catch (error) {
    setStatus(elements.qaStatus, error.message, "error");
  } finally {
    elements.askButton.disabled = false;
  }
}

function retrieveChunks(question, topK) {
  const queryTokens = tokenize(question);
  if (!queryTokens.length) {
    return [];
  }

  const scoredChunks = state.corpus
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map((entry) => ({
      ...entry.chunk,
      score: entry.score,
    }));

  return scoredChunks;
}

function scoreChunk(chunk, queryTokens) {
  const { averageLength, docFrequencies, totalDocs } = state.retrievalStats;
  if (!totalDocs || !averageLength) {
    return 0;
  }

  const k1 = 1.4;
  const b = 0.75;
  const uniqueQueryTerms = new Set(queryTokens);
  let score = 0;

  uniqueQueryTerms.forEach((term) => {
    const termFrequency = chunk.termFrequencies.get(term) ?? 0;
    if (!termFrequency) {
      return;
    }

    const documentFrequency = docFrequencies.get(term) ?? 0;
    if (!documentFrequency) {
      return;
    }

    const idf = Math.log(1 + (totalDocs - documentFrequency + 0.5) / (documentFrequency + 0.5));
    const normalizer = k1 * (1 - b + b * (chunk.tokenCount / averageLength));
    score += idf * ((termFrequency * (k1 + 1)) / (termFrequency + normalizer));
  });

  return score;
}

async function requestGroundedAnswer({ apiKey, question, model, chunks }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: DEVELOPER_PROMPT }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildUserPrompt(question, chunks) }],
        },
      ],
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenAI returned an unexpected error.");
  }

  const answer = extractOutputText(payload);
  if (!answer) {
    throw new Error("The model returned an empty answer.");
  }

  return answer;
}

function buildUserPrompt(question, chunks) {
  const context = chunks
    .map(
      (chunk, index) =>
        [
          `[${index + 1}]`,
          `source_file: ${chunk.sourceFile}`,
          `document_title: ${chunk.documentTitle}`,
          `page_number: ${chunk.pageNumber}`,
          `chunk_id: ${chunk.chunkId}`,
          "text:",
          chunk.text,
        ].join("\n"),
    )
    .join("\n\n");

  return [
    "Question:",
    question,
    "",
    "Retrieved context:",
    context,
    "",
    "Write a short answer grounded in the context above.",
    'When you make a factual claim, cite it with bracketed references like [1] or [2].',
    'End with a separate line that starts with "Citations:" and lists the references you used.',
  ].join("\n");
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const textFragments = [];
  const outputs = Array.isArray(payload.output) ? payload.output : [];

  outputs.forEach((outputItem) => {
    const contentItems = Array.isArray(outputItem.content) ? outputItem.content : [];
    contentItems.forEach((contentItem) => {
      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        const cleaned = contentItem.text.trim();
        if (cleaned) {
          textFragments.push(cleaned);
        }
      }
    });
  });

  return textFragments.join("\n\n").trim();
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  elements.emptyState.hidden = state.history.length > 0;

  state.history.forEach((turn, index) => {
    const article = document.createElement("article");
    article.className = "panel answer-card";

    const header = document.createElement("div");
    header.className = "answer-header";

    const left = document.createElement("div");
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = `Question ${index + 1}`;
    const questionCopy = document.createElement("p");
    questionCopy.className = "question-copy";
    questionCopy.textContent = turn.question;
    left.append(label, questionCopy);

    const meta = document.createElement("div");
    meta.className = "chip-wrap";
    meta.appendChild(buildChip(`Model: ${turn.model}`));
    meta.appendChild(buildChip(`Chunks: ${turn.topK}`));
    meta.appendChild(buildChip(turn.createdAt));
    header.append(left, meta);

    const answerLabel = document.createElement("div");
    answerLabel.className = "section-label";
    answerLabel.textContent = "Final Answer";

    const answerBlock = document.createElement("div");
    answerBlock.className = "answer-block";
    answerBlock.textContent = turn.answer;

    const sourcesLabel = document.createElement("div");
    sourcesLabel.className = "section-label";
    sourcesLabel.textContent = "Retrieved Source Chunks";

    const sourcesGrid = document.createElement("div");
    sourcesGrid.className = "sources-grid";

    turn.retrievedChunks.forEach((chunk, chunkIndex) => {
      const details = document.createElement("details");
      details.className = "source-item";

      const summary = document.createElement("summary");
      summary.className = "source-summary";

      const summaryLeft = document.createElement("div");
      const title = document.createElement("div");
      title.className = "source-title";
      title.textContent = `[${chunkIndex + 1}] ${chunk.sourceFile}`;
      const metaCopy = document.createElement("div");
      metaCopy.className = "source-meta";
      metaCopy.textContent = `Page ${chunk.pageNumber} · Score ${chunk.score.toFixed(4)} · ${chunk.chunkId}`;
      summaryLeft.append(title, metaCopy);

      const summaryRight = buildChip(chunk.documentTitle);
      summary.append(summaryLeft, summaryRight);

      const body = document.createElement("div");
      body.className = "source-body";
      const sourceText = document.createElement("div");
      sourceText.className = "source-text";
      sourceText.textContent = chunk.text;
      body.appendChild(sourceText);

      details.append(summary, body);
      sourcesGrid.appendChild(details);
    });

    article.append(header, answerLabel, answerBlock, sourcesLabel, sourcesGrid);
    elements.historyList.appendChild(article);
  });
}

function buildChip(text) {
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  chip.textContent = text;
  return chip;
}

function tokenize(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function countTerms(tokens) {
  const termFrequencies = new Map();
  tokens.forEach((token) => {
    termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
  });
  return termFrequencies;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function stripFileExtension(filename) {
  return filename.replace(/\.[^.]+$/, "");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setStatus(element, message, tone) {
  element.textContent = message;

  if (tone) {
    element.dataset.tone = tone;
  } else {
    delete element.dataset.tone;
  }
}

async function sha256(input) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
