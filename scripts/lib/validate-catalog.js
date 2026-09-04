const ID_RE = /^[a-z0-9-]+$/;

export function validateCatalog(doc) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== "object") {
    errors.push("Catalog root must be an object");
    return { errors, warnings };
  }
  if (!Array.isArray(doc.certificates) || doc.certificates.length === 0) {
    errors.push("certificates must be a non-empty array");
    return { errors, warnings };
  }
  const seen = new Set();
  for (const [i, c] of doc.certificates.entries()) {
    const loc = `certificates[${i}]`;
    if (!c || typeof c !== "object") {
      errors.push(`${loc}: must be an object`);
      continue;
    }
    for (const key of ["id", "title", "issuer", "summary", "credentialId", "verifyUrl"]) {
      if (typeof c[key] !== "string" || !c[key].trim()) {
        errors.push(`${loc}: missing required string "${key}"`);
      }
    }
    if (c.id && !ID_RE.test(c.id)) errors.push(`${loc}: id must match [a-z0-9-]+`);
    if (c.id) {
      if (seen.has(c.id)) errors.push(`${loc}: duplicate id "${c.id}"`);
      seen.add(c.id);
    }
    if (typeof c.year !== "number" || !Number.isFinite(c.year)) {
      errors.push(`${loc}: year must be a number`);
    }
    if (!Array.isArray(c.tags)) errors.push(`${loc}: tags must be an array`);
    else if (c.tags.length === 0) warnings.push(`${loc} (${c.id}): empty tags`);
    if (!c.image) warnings.push(`${loc} (${c.id}): missing image`);
    if (c.verifyUrl === "#") warnings.push(`${loc} (${c.id}): verifyUrl is placeholder #`);
    if (c.verifyUrl && c.verifyUrl !== "#" && !/^https:/i.test(c.verifyUrl)) {
      errors.push(`${loc}: verifyUrl must be https: or #`);
    }
  }
  return { errors, warnings };
}
