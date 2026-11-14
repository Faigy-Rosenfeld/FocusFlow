export default function QuizModal({ question, onCorrect, onWrong }) {
  if (!question) return null;

  const handleAnswer = (index) => {
    if (index === question.correct) {
      onCorrect();
    } else {
      onWrong();
    }
  };

  return (
    <div className="quiz-overlay">
      <div className="quiz-modal">
        <span className="quiz-modal-label">בדיקת ריכוז</span>
        <p className="quiz-question">{question.question}</p>
        <div className="quiz-options">
          {question.options.map((opt, i) => (
            <button key={i} onClick={() => handleAnswer(i)} className="quiz-option">
              <span className="quiz-option-letter">{String.fromCharCode(1488 + i)}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
