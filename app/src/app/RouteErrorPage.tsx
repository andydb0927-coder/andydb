import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

function RecoveryScreen({ notFound }: { notFound: boolean }) {
  return (
    <main className="platform-page" role="alert">
      <h1>{notFound ? '页面不存在' : '页面暂时无法打开'}</h1>
      <p>{notFound ? '链接可能已失效，请返回首页重新选择项目。' : '页面或本地存储暂时不可用，请重新加载后再试。'}</p>
      <p>重新加载不会清除当前浏览器保存的项目、资产或生成历史。</p>
      <nav aria-label="页面恢复操作">
        <Link to="/">返回首页</Link>
        {!notFound ? <button type="button" onClick={() => window.location.reload()}>重新加载</button> : null}
      </nav>
    </main>
  )
}

export function RouteErrorPage() {
  const error: unknown = useRouteError()
  return <RecoveryScreen notFound={isRouteErrorResponse(error) && error.status === 404} />
}

export function RouteNotFoundPage() {
  return <RecoveryScreen notFound />
}
