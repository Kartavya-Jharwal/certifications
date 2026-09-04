export function buildJsonLd(certificates, { canonical = "https://kartavya.tech/certifications/" } = {}) {
  const person = {
    "@type": "Person",
    name: "Kartavya Jharwal",
    url: "https://kartavya.tech/",
  };

  const items = certificates.map((c, i) => {
    const cred = {
      "@type": "EducationalOccupationalCredential",
      name: c.title,
      description: c.summary,
      url: c.verifyUrl && c.verifyUrl !== "#" ? c.verifyUrl : canonical,
      credentialCategory: "certificate",
    };
    if (c.issuer) cred.recognizedBy = { "@type": "Organization", name: c.issuer };
    if (c.credentialId && c.credentialId !== "—") cred.identifier = c.credentialId;
    if (c.year) cred.dateCreated = String(c.year);
    return { "@type": "ListItem", position: i + 1, item: cred };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      person,
      {
        "@type": "ItemList",
        name: "Certificate Wall",
        description: "Inspectable credentials — proof of technical execution.",
        url: canonical,
        numberOfItems: certificates.length,
        itemListElement: items,
      },
    ],
  };
}
