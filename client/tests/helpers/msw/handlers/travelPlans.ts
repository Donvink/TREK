import { http, HttpResponse } from 'msw';

export const travelPlansHandlers = [
  // A trip place that did not come from a guide: the evidence block stays hidden.
  http.get('/api/travel-plans/evidence/:tripId/:placeId', () =>
    HttpResponse.json({ error: 'No guide evidence for this place' }, { status: 404 }),
  ),
];
