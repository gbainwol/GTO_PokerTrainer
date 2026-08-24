export const createApiClient = (baseUrl) => {
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed (${response.status})`);
    }
    return response.json();
  };

  return {
    createSession: (payload) =>
      request("/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    endSession: (id, payload) =>
      request(`/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    postSessionEvents: (id, events) =>
      request(`/sessions/${id}/events`, {
        method: "POST",
        body: JSON.stringify({ events }),
      }),
    postScenario: (payload) =>
      request("/scenarios", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };
};

export const createSolverClient = (baseUrl) => {
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Solver request failed (${response.status})`);
    }
    return response.json();
  };

  return {
    solve: (payload) =>
      request("/solve", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  };
};
