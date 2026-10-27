import { SettingsModel } from '../models/settingsModel.js';
import { UserModel } from '../models/userModel.js';
import { validateName, validateSettings } from '../utils/validators.js';

export const SettingsController = {
  get(req, res) {
    res.json({ settings: SettingsModel.get(req.user.id) });
  },

  update(req, res) {
    const next = validateSettings(req.body, SettingsModel.get(req.user.id));
    res.json({ message: 'Configurações salvas.', settings: SettingsModel.save(req.user.id, next) });
  },

  updateProfile(req, res) {
    const user = UserModel.updateName(req.user.id, validateName(req.body));
    res.json({ message: 'Nome atualizado!', user });
  },
};
