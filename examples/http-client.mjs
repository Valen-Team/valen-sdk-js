import { Valen } from '@valen-team/sdk';

const client = Valen.remote('http://127.0.0.1:8000/v1', { model: 'valen' });
try {
  const result = await client.decisions({
    input: 'Please send my order to my new address.',
    questions: [{ name: 'change_address', type: 'predicate',
      instructions: 'Is the customer requesting a delivery address change?' }],
  });
  console.log('Address change probability:', result.answers[0].probability);
} finally {
  await client.close();
}
