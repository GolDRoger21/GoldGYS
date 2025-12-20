# Stage 10 – Firestore Rules & Functions

Bu paket:
- firestore/firestore.rules
- firestore/firestore.indexes.json
- functions/ (admin claim atama şablonu)
- docs/security-and-scaling.md
- docs/manual-auth-rules-test-checklist.md (manuel doğrulama senaryoları)

Uygulama:
1) Firebase CLI ile rules deploy:
   firebase deploy --only firestore:rules
2) Index deploy:
   firebase deploy --only firestore:indexes
3) Functions deploy (opsiyonel):
   cd functions
   npm i
   cd ..
   firebase deploy --only functions
