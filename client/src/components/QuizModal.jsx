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
        <h3>Focus Check</h3>
        <p className="quiz-question">{question.question}</p>
        <div className="quiz-options">
          {question.options.map((opt, i) => (
            <button key={i} onClick={() => handleAnswer(i)} className="quiz-option">
              <span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
