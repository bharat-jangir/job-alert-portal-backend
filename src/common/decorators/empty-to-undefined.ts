import { Transform } from 'class-transformer';

/** Turns '' / null from HTML forms into undefined so optional validators skip them. */
export const EmptyToUndefined = () =>
  Transform(({ value }) => (value === '' || value === null ? undefined : value));

/** "true"/"false"/true/false -> boolean (class-transformer's Boolean() makes "false" truthy). */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return undefined;
  });
