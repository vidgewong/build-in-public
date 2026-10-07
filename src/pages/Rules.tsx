import { Link } from 'react-router-dom';
import { useSite } from '../lib/site-context';

export default function Rules() {
  const { state } = useSite();
  const { claimWindowDays } = state;

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <span className="section-index">规则</span>
          <h2 className="section-title">你怎么拿到这笔钱</h2>
        </div>
        <div className="manifesto">
          <ol>
            <li>
              周期性的约定，在<Link to="/records">记录页</Link>上找<strong>红色格子</strong>，
              那是我没有记录的周期，点一下就能复制索赔话术。
              我拿不出证明，立刻转账。
            </li>
            <li>
              <strong>随时生效的约定</strong>——抱怨工作、吃糖、讨好、提原生家庭——
              我没法自证，<strong>由你们随时监督</strong>。当场抓到就算，我立刻转账。
            </li>
            <li>
              一次违约事件<strong>只付给第一个发现的人</strong>。
            </li>
            <li>
              你不需要天天盯着。随便哪天想点杯奶茶了，上来翻一翻，
              <strong>滚动 {claimWindowDays} 天内</strong>的违约事件都还作数。
            </li>
            <li>
              法定节假日和我提前标注的豁免日不计入。<strong>其余一律算数。</strong>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
