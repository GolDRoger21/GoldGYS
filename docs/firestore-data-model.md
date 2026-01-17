
# Firestore Veri Modeli (Stage 5)

## Koleksiyonlar

### topics
- id (string)
- title
- category: ortak | alan
- order
- isActive

### lessons
- id
- topicId
- title
- contentHTML
- order
- isActive

### tests
- id
- topicId
- title
- questionCount
- duration (optional)
- isActive

### questions
- id
- testId
- text
- options[]
- correct
- solution{dayanak, analiz, tuzak, hap}
- difficulty
- isActive

### exams
- id
- title
- duration
- totalQuestions
- isActive

### users/{uid}
- role: student | admin
- createdAt

### users/{uid}/progress
- topicId
- completedTests
- scoreAvg

### users/{uid}/wrongs
- questionId
- testId
- createdAt

### users/{uid}/favorites
- questionId
- testId
- createdAt

### reports
- questionId
- userId
- message
- status
