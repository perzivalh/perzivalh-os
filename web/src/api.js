const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

let authToken = localStorage.getItem("token");

export function setToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMessage = errorBody.error || "request_failed";
    throw new Error(errorMessage);
  }
  return response.json();
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiPost(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}
