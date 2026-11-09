using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using NzbDrone.Core.Download;
using NzbDrone.Core.Download.Pending;
using NzbDrone.Core.Download.TrackedDownloads;
using NzbDrone.Core.Messaging.Commands;
using NzbDrone.Core.Queue;
using Sonarr.Http;
using Sonarr.Http.REST;

#pragma warning disable CS0612
namespace Sonarr.Api.V3.Queue
{
    [V3ApiController("queue")]
    public class QueueActionController : Controller
    {
        private readonly IPendingReleaseService _pendingReleaseService;
        private readonly IDownloadService _downloadService;
        private readonly IObsoleteQueueService _queueService;
        private readonly ITrackedDownloadService _trackedDownloadService;
        private readonly IProvideDownloadClient _downloadClientProvider;
        private readonly IManageCommandQueue _commandQueueManager;

        public QueueActionController(IPendingReleaseService pendingReleaseService,
                                     IDownloadService downloadService,
                                     IObsoleteQueueService queueService,
                                     ITrackedDownloadService trackedDownloadService,
                                     IProvideDownloadClient downloadClientProvider,
                                     IManageCommandQueue commandQueueManager)
        {
            _pendingReleaseService = pendingReleaseService;
            _downloadService = downloadService;
            _queueService = queueService;
            _trackedDownloadService = trackedDownloadService;
            _downloadClientProvider = downloadClientProvider;
            _commandQueueManager = commandQueueManager;
        }

        [HttpPost("grab/{id:int}")]
        public async Task<object> Grab([FromRoute] int id)
        {
            var pendingRelease = _pendingReleaseService.FindPendingQueueItem(id);

            if (pendingRelease == null)
            {
                throw new NotFoundException();
            }

            await _downloadService.DownloadReport(pendingRelease.RemoteEpisode, null);

            return new { };
        }

        [HttpPost("grab/bulk")]
        [Consumes("application/json")]
        public async Task<object> Grab([FromBody] QueueBulkResource resource)
        {
            foreach (var id in resource.Ids)
            {
                var pendingRelease = _pendingReleaseService.FindPendingQueueItem(id);

                if (pendingRelease == null)
                {
                    throw new NotFoundException();
                }

                await _downloadService.DownloadReport(pendingRelease.RemoteEpisode, null);
            }

            return new { };
        }

        [HttpPost("resume/{id:int}")]
        public object Resume([FromRoute] int id)
        {
            var queueItem = _queueService.Find(id);

            if (queueItem == null)
            {
                throw new NotFoundException();
            }

            var trackedDownload = _trackedDownloadService.Find(queueItem.DownloadId);

            if (trackedDownload == null)
            {
                throw new NotFoundException();
            }

            ResumeTrackedDownload(trackedDownload, queueItem);
            _commandQueueManager.Push(new RefreshMonitoredDownloadsCommand());

            return new { };
        }

        [HttpPost("resume/bulk")]
        [Consumes("application/json")]
        public object Resume([FromBody] QueueBulkResource resource)
        {
            var resumedDownloadIds = new HashSet<string>();

            foreach (var id in resource.Ids)
            {
                var queueItem = _queueService.Find(id);

                if (queueItem == null)
                {
                    continue;
                }

                var trackedDownload = _trackedDownloadService.Find(queueItem.DownloadId);

                if (trackedDownload == null)
                {
                    continue;
                }

                if (resumedDownloadIds.Add(trackedDownload.DownloadItem.DownloadId))
                {
                    ResumeTrackedDownload(trackedDownload, queueItem);
                }
                else
                {
                    queueItem.Status = QueueStatus.Queued;
                }
            }

            if (resumedDownloadIds.Count > 0)
            {
                _commandQueueManager.Push(new RefreshMonitoredDownloadsCommand());
            }

            return new { };
        }

        private void ResumeTrackedDownload(TrackedDownload trackedDownload, NzbDrone.Core.Queue.Queue queueItem)
        {
            var downloadClient = _downloadClientProvider.Get(trackedDownload.DownloadClient);

            if (downloadClient == null)
            {
                throw new BadRequestException();
            }

            downloadClient.ResumeItem(trackedDownload.DownloadItem);
            trackedDownload.DownloadItem.Status = DownloadItemStatus.Queued;
            queueItem.Status = QueueStatus.Queued;
        }
    }
}
#pragma warning restore CS0612
