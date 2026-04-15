export const requestCalendarPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const getCalendarsAsync = jest.fn().mockResolvedValue([{ id: 'test-calendar' }]);
export const getEventsAsync = jest.fn().mockResolvedValue([]);
export const EntityTypes = { EVENT: 'event' };
