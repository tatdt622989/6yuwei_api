const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True for a string with visible text. Request bodies can hold arrays and objects instead. */
const isText = (value) => typeof value === 'string' && value.trim() !== '';

module.exports = { escapeRegex, isText };
