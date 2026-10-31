/** Offline example; mock fetch never contacts a provider. */
import { Valen, choice, predicate } from '@valen-team/sdk';
const client = Valen.remote('https://example.test/v1', {
  totalTimeout: 5000,
  onEvent: event => console.log(event),
  fetch: async () => new Response(JSON.stringify({ model:'example', answers:{
    intent:{type:'choice', choice:'refund', probabilities:{refund:.9, delivery:.1}, confidence:.8},
    urgent:{type:'noul', noul:.2},
  }, usage:{input_tokens:null, output_tokens:null} })),
});
try {
  const result = await client.systemOne('Please refund my order.', {
    intent: choice('What does the customer request?', {refund:'Refund', delivery:'Delivery status'}),
    urgent: predicate('The customer needs urgent help.'),
  });
  console.log(result.answers.intent.choice);
} finally { await client.close(); }
