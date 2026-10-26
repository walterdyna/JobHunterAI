import axios from "axios";

const API_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function generateCareerAssets(payload, config = {}) {
  const response = await axios.post(`${API_URL}/api/ai/generate`, payload, config);
  return response.data;
}

export async function runAutomation(payload, config = {}) {
  const response = await axios.post(`${API_URL}/api/ai/automation/run`, payload, config);
  return response.data;
}

export async function stopAutomation(config = {}) {
  const response = await axios.post(`${API_URL}/api/ai/automation/stop`, {}, config);
  return response.data;
}

export async function getAutomationStatus(config = {}) {
  const response = await axios.get(`${API_URL}/api/ai/automation/status`, config);
  return response.data;
}
