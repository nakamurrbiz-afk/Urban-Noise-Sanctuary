export const requestForegroundPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const getCurrentPositionAsync = jest.fn().mockResolvedValue({ coords: { latitude: 35.6762, longitude: 139.6503, speed: 0 } });
export const watchPositionAsync = jest.fn().mockResolvedValue({ remove: jest.fn() });
export const Accuracy = { High: 6, Balanced: 3, Low: 1 };
