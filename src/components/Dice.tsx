const dots = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]

export default function Dice({ values, rolling }: { values: [number, number]; rolling: boolean }) {
  return <div className={`dice-pair ${rolling ? 'is-rolling' : ''}`} aria-label={`Dados: ${values[0]} e ${values[1]}`}>
    {values.map((value, die) => <div className="die" key={die}>
      {Array.from({ length: 9 }, (_, index) => <i key={index} className={dots[value].includes(index) ? 'on' : ''} />)}
    </div>)}
    <span className="dice-total">{rolling ? '••' : `Total ${values[0] + values[1]}`}</span>
  </div>
}
