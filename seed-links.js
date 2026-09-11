const types = [
  "RESULT",
  "ANSWERKEY",
  "ADMISSION",
  "ADMITCARD",
  "ONLINEFORM",
  "UPDATE",
  "SYLLABUS",
  "UPCOMING",
  "VERIFICATION",
  "SARKARIYOJANA",
];

async function seed() {
  for (const type of types) {
    for (let i = 1; i <= 3; i++) {
      const payload = {
        type: type,
        title: `Dummy ${type} Link ${i}`,
        slug: `dummy-${type.toLowerCase()}-link-${i}`,
        targetId: "",
        externalUrl: "https://example.com",
        redirectType: "external",
        isActive: true,
      };

      try {
        const response = await fetch("http://localhost:3001/api/redirect-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          console.log(`Created: ${type} - ${i}`);
        } else {
          console.error(`Failed to create ${type} - ${i}:`, await response.text());
        }
      } catch (err) {
        console.error(`Error with ${type} - ${i}:`, err.message);
      }
    }
  }
}

seed().then(() => console.log('Done seeding!'));
