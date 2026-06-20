// Shim: vendored seeker modules import './firebase' or '../firebase' (all
// resolving here, at seeker/lib/firebase.js). Re-export the extension's real
// Firebase init so the vendored code runs unchanged. See firebaseInit.js.
export {
  app,
  auth,
  db,
  storage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
} from '../firebaseInit.js';
