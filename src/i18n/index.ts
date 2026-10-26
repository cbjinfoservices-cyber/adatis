import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import messages from './local/index';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Pas de « lng » fixe : il écraserait la langue choisie à chaque rechargement.
    // Langue retenue : celle mémorisée par le menu, sinon le français.
    supportedLngs: ['fr', 'en', 'es', 'de', 'ar'],
    load: 'languageOnly',
    fallbackLng: 'fr',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    debug: false,
    resources: messages,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
