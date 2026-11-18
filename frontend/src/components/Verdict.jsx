const LABEL = {
  answered: 'Answered',
  blocked: 'Blocked',
  unavailable: 'Defense unreachable',
  error: 'Error',
};

export default function Verdict({ verdict }) {
  return <span className={`verdict ${verdict}`}>{LABEL[verdict] || verdict}</span>;
}
