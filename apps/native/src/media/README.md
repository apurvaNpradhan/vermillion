# media

Public surface: `index.ts`. Each folder is one feature; hooks, components, pure logic and tests live together.

- `queue/`: the PowerSync attachment queue, its local and remote storage, transfer gate, failures and the bucket upload. Start at `attachment-queue.ts`.
- `picking/`: picking or capturing an image, processing it and saving it with its row. Start at `use-picked-media.ts`.
- `viewing/`: showing Media from the local store, batches of them and the full-screen viewer. Start at `media-image.tsx`.
