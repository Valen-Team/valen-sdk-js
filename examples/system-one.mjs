import { Valen } from '@valen-team/sdk';

const client = await Valen.local('Valen-Team/Valen-0.8B-ONNX', { variant: 'fp32' });
try {
  const result = await client.systemOne('I moved. Please ship my order to 12 Elm Street instead.', {
    intent: { type: 'choice', instructions: 'What does the customer want?',
      criteria: { address: 'Change the delivery address', cancel: 'Cancel the order' } },
    change_address: { type: 'noul', instructions: 'The customer requests a delivery address change.' },
    explicitness: { type: 'score', instructions: 'How explicit is the request?',
      criteria: ['No request', 'Asks whether a change is possible', 'Explicitly requests a change'] },
  });
  console.log('Intent:', result.answers.intent.choice);
  console.log('Address change probability:', result.answers.change_address.noul.toFixed(3));
  console.log('Explicitness score (0–2):', result.answers.explicitness.score.toFixed(3));
} finally {
  await client.close();
}
