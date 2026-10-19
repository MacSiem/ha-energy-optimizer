"use strict";
// A private realm facade: explicit locales stay native; undefined selects the
// simulated device region. Never changes process/global Intl or navigator.
function systemIntl(defaultLocale, native = Intl) {
  const DateTimeFormat = function(locales, options) {
    return new native.DateTimeFormat(locales === undefined
      ? (typeof defaultLocale === 'function' ? defaultLocale() : defaultLocale) : locales, options);
  };
  DateTimeFormat.supportedLocalesOf = native.DateTimeFormat.supportedLocalesOf.bind(native.DateTimeFormat);
  return Object.assign(Object.create(native), {DateTimeFormat});
}
module.exports = {systemIntl};
