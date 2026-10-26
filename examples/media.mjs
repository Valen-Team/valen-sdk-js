import { Valen } from '@valen-team/sdk';

const [path, mode] = process.argv.slice(2);
const video = mode === '--video';
const question = video ? {
  name: 'sauce', type: 'choice',
  instructions: 'What color is the sauce in the foil container on the left?',
  choices: ['brown', 'white', 'red', 'orange'].map(value => ({ value, description: value })),
} : {
  name: 'animal', type: 'choice', instructions: 'Which animals are shown?',
  choices: [{ value: 'sheep', description: 'Sheep' }, { value: 'dogs', description: 'Dogs' }],
};
const client = await Valen.local('Valen-Team/Valen-0.8B-ONNX', {
  variant: 'fp32', mediaKwargs: { videos_kwargs: { num_frames: 4, fps: null } },
});
try {
  const result = await client.decisions({
    input: [{ role: 'user', content: [video
      ? { type: 'input_video', video_url: path }
      : { type: 'input_image', image_url: path }] }],
    questions: [question],
  });
  console.log(video ? 'Video answer:' : 'Image answer:', result.answers[0].choice);
} finally {
  await client.close();
}
