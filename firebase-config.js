/* Firebase project config -- from Firebase Console -> Project settings -> General -> "Your apps".
   This object is meant to be public; firestore.rules is what protects the family's recipes.
   (If apiKey says PASTE, the app runs on this device only, like Phase 1.) */
const firebaseConfig = {
  apiKey: 'AIzaSyC8P62xCiIhPfm-1s2v8wZ6VpOIMuQOfE8',
  authDomain: 'blue-book-yvphk.firebaseapp.com',
  projectId: 'blue-book-yvphk',
  storageBucket: 'blue-book-yvphk.firebasestorage.app',
  messagingSenderId: '39210602310',
  appId: '1:39210602310:web:a596f7365df500f0205f47',
};

// Import from a link: the Cloudflare helper's address (see import-helper/README). Empty = link importing is off.
const importHelperUrl = 'https://bluebook-import.gabriella-layne-brown.workers.dev';
