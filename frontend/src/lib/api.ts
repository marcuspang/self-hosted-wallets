const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

export function getApiUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}

export async function apiRequest(endpoint: string, options?: RequestInit) {
  const url = getApiUrl(endpoint)
  const response = await fetch(url, {
    ...options,
    credentials: 'include'
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      errorText || `Request failed with status ${response.status}`
    )
  }

  return response.json()
}
