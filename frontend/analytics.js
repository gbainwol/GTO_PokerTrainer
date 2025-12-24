// Simple analytics sink that captures events and logs them for analysis.

class AnalyticsClient {
  constructor() {
    this.events = [];
    this.assignments = [];
  }

  trackEvent(name, payload = {}) {
    const event = { name, payload, ts: Date.now() };
    this.events.push(event);
    // Placeholder sink: log to console. Swap with real client as needed.
    console.info('[analytics:event]', event);
  }

  trackAssignment(experimentName, variant, metadata = {}) {
    const assignment = { experimentName, variant, metadata, ts: Date.now() };
    this.assignments.push(assignment);
    console.info('[analytics:assignment]', assignment);
  }

  getEvents() {
    return [...this.events];
  }

  getAssignments() {
    return [...this.assignments];
  }

  clear() {
    this.events = [];
    this.assignments = [];
  }
}

export const analytics = new AnalyticsClient();
