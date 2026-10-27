import { getWeather } from '../services/weatherService.js';

export const WeatherController = {
  async current(req, res) {
    res.json(await getWeather(req.query.lat, req.query.lon));
  },
};
