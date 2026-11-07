# Storage Infrastructure Documentation (`server/src/infrastructure/storage`)

## A. Directory Overview
The `server/src/infrastructure/storage` directory provides a backward-compatible storage facade for the application's media persistence layer. It re-exports the Cloudinary service interface, allowing existing consumers or future storage providers (such as AWS S3 or Google Cloud Storage) to be swapped or configured without breaking existing import contracts.

## B. Directory Structure
```text
server/src/infrastructure/storage/
├── storage.md           # This documentation file
└── cloudinary.js        # Re-export facade to cloudinaryService.js
```

## C. File-by-File Documentation

### 1. `cloudinary.js`
- **File Type:** JavaScript Module (ESM)
- **Primary Responsibility:** Re-exports all members from `../cloudinary/cloudinaryService.js`.
- **Exported Symbols:** Re-exports `uploadImageToCloudinary`, `deleteCloudinaryAsset`, `validateCloudinaryConfig`, `setCloudinaryUploaderMock`, `setCloudinaryDestroyerMock`.
- **Dependencies:** `../cloudinary/cloudinaryService.js`.
- **Used By:** Legacy imports and compatibility layers.

## D. Child Directory Documentation
No child subdirectories exist in this directory.

## E. Internal Relationships
```mermaid
flowchart LR
    Consumer["Event Service / Tests"] --> Facade["storage/cloudinary.js"]
    Facade --> Service["cloudinary/cloudinaryService.js"]
    Service --> SDK["Cloudinary Node.js SDK"]
```

## F. Execution Flow
Consumers importing from `infrastructure/storage/cloudinary.js` delegate directly to `infrastructure/cloudinary/cloudinaryService.js`.

## G. External Dependencies and Integrations
Delegates to `cloudinary/cloudinaryService.js`.

## H. Important Implementation Notes
Maintains architectural decoupling so future alternative storage engines can implement the same contract seamlessly.

## I. Related Documentation
- [Cloudinary Infrastructure (`server/src/infrastructure/cloudinary/cloudinary.md`)](../cloudinary/cloudinary.md)
- [Infrastructure Parent Directory (`server/src/infrastructure/infrastructure.md`)](../infrastructure.md)
- [Server Root Documentation (`server/server_root.md`)](../../../server_root.md)

