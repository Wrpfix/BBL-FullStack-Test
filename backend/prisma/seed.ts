// Seeds two unrelated users, each with their own collection and bookmarks,
// so cross-user leakage (CLAUDE.md's core privacy rule) is easy to assert
// against in manual testing or future integration tests.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.bookmark.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.user.deleteMany();

  const alice = await prisma.user.create({
    data: { auth0Sub: 'auth0|seed-alice', email: 'alice@example.com' },
  });
  const bob = await prisma.user.create({
    data: { auth0Sub: 'auth0|seed-bob', email: 'bob@example.com' },
  });

  const aliceReading = await prisma.collection.create({
    data: { name: 'Reading list', ownerId: alice.id },
  });

  await prisma.bookmark.createMany({
    data: [
      {
        url: 'https://alice.example.com/article-1',
        title: "Alice's article",
        ownerId: alice.id,
        collectionId: aliceReading.id,
      },
      {
        url: 'https://alice.example.com/unsorted',
        title: "Alice's unsorted bookmark",
        ownerId: alice.id,
      },
    ],
  });

  const bobRecipes = await prisma.collection.create({
    data: { name: 'Recipes', ownerId: bob.id },
  });

  await prisma.bookmark.createMany({
    data: [
      {
        url: 'https://bob.example.com/recipe-1',
        title: "Bob's recipe",
        ownerId: bob.id,
        collectionId: bobRecipes.id,
      },
      {
        url: 'https://bob.example.com/unsorted',
        title: "Bob's unsorted bookmark",
        ownerId: bob.id,
      },
    ],
  });

  console.log(
    `Seeded: ${alice.email} (user ${alice.id}, collection ${aliceReading.id}), ` +
      `${bob.email} (user ${bob.id}, collection ${bobRecipes.id})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
